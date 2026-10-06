package api

// POST /issuer/series — create a bond series (Plan 2 Task 5): validate the
// terms (same rules as the CLI's parseSeriesCreateArgs), reserve the name in
// the series registry, regenerate the executor config, then run
// `qupon series:create` which mints the Token-2022 bond mint and initializes
// the on-chain Series. A CLI failure rolls the placeholder back and surfaces
// as 409 with the Anchor/CLI message in onchainError.

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/execconfig"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// seriesCreateRequest is openapi.yaml#/components/schemas/SeriesCreateRequest.
type seriesCreateRequest struct {
	Name          string `json:"name"`
	ISIN          string `json:"isin"`
	FaceValue     uint64 `json:"faceValue"`
	CouponRateBps int    `json:"couponRateBps"`
	Frequency     int    `json:"frequency"`
	DayCount      string `json:"dayCount"`
	IssueDate     string `json:"issueDate"`
	MaturityDate  string `json:"maturityDate"`
	Cash          string `json:"cash"`     // legacy alias tkzt | usdc
	CashMint      string `json:"cashMint"` // any enabled cash asset of this network (platform v2 §5.1)
}

var (
	seriesNameRe = regexp.MustCompile(`^[A-Za-z0-9-]{1,16}$`)
	isinRe       = regexp.MustCompile(`^[A-Z]{2}[A-Z0-9]{9}[0-9]$`)
)

// validate mirrors the CLI's parseSeriesCreateArgs rules (clients/ts/src/commands/seriesCreate.ts).
func (req *seriesCreateRequest) validate() error {
	if !seriesNameRe.MatchString(req.Name) {
		return errors.New("name must be 1-16 characters of A-Z a-z 0-9 -")
	}
	if !isinRe.MatchString(req.ISIN) {
		return errors.New("ISIN must be 12 characters: 2 letters, 9 alphanumerics, 1 check digit")
	}
	if req.FaceValue == 0 {
		return errors.New("face must be > 0 minor units")
	}
	if req.CouponRateBps < 1 || req.CouponRateBps > 10000 {
		return errors.New("rate must be 1..10000 bps")
	}
	switch req.Frequency {
	case 1, 2, 4, 12:
	default:
		return errors.New("frequency must be 1, 2, 4 or 12 per year")
	}
	if req.DayCount != "THIRTY_360" && req.DayCount != "ACT_365" {
		return errors.New("day count must be THIRTY_360 or ACT_365")
	}
	issue, err := time.Parse("2006-01-02", req.IssueDate)
	if err != nil {
		return errors.New("issue date must be YYYY-MM-DD")
	}
	maturity, err := time.Parse("2006-01-02", req.MaturityDate)
	if err != nil {
		return errors.New("maturity date must be YYYY-MM-DD")
	}
	if !maturity.After(issue) {
		return errors.New("maturity date must be after the issue date")
	}
	switch {
	case req.Cash != "" && req.CashMint != "":
		return errors.New("send cash or cashMint, not both")
	case req.CashMint != "":
		if _, err := solana.PublicKeyFromBase58(req.CashMint); err != nil {
			return errors.New("cashMint must be a base58 mint address")
		}
	case req.Cash != "tkzt" && req.Cash != "usdc":
		return errors.New("cash must be tkzt or usdc, or send cashMint")
	}
	return nil
}

// termYears is the config/devnet.json termYears the CLI computes: whole years
// issue → maturity, at least 1.
func (req *seriesCreateRequest) termYears() int {
	issue, _ := time.Parse("2006-01-02", req.IssueDate)
	maturity, _ := time.Parse("2006-01-02", req.MaturityDate)
	days := maturity.Sub(issue).Hours() / 24
	return int(math.Max(1, math.Round(days/365)))
}

// termsRow is the registry entry (store.RegistryRow.Terms): the series config
// the executor config is generated from; execconfig.Write adds the mint.
func (req *seriesCreateRequest) termsRow() (store.RegistryRow, error) {
	cashMint := req.CashMint // the CLI resolves a raw address as the cash mint
	switch req.Cash {
	case "tkzt":
		cashMint = "tKZT"
	case "usdc":
		cashMint = "USDC"
	}
	terms, err := json.Marshal(map[string]any{
		"cashMint":      cashMint,
		"isin":          req.ISIN,
		"faceValue":     req.FaceValue,
		"couponRateBps": req.CouponRateBps,
		"frequency":     req.Frequency,
		"dayCount":      req.DayCount,
		"termYears":     req.termYears(),
	})
	if err != nil {
		return store.RegistryRow{}, fmt.Errorf("marshal terms %s: %w", req.Name, err)
	}
	return store.RegistryRow{Name: req.Name, Mint: "", Terms: terms}, nil
}

// writeExecConfig regenerates the executor's writable config (base + registry).
func writeExecConfig(deps Deps, st *store.Store, r *http.Request) error {
	rows, err := st.ListRegistry(r.Context())
	if err != nil {
		return fmt.Errorf("list series registry: %w", err)
	}
	if err := execconfig.Write(deps.BaseConfig, deps.Executor.ConfigPath(), rows); err != nil {
		return fmt.Errorf("write executor config: %w", err)
	}
	return nil
}

func createSeries(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Executor == nil {
			writeError(w, http.StatusServiceUnavailable, "executor not configured (set QUPON_CLI)")
			return
		}
		if deps.BaseConfig == "" {
			writeError(w, http.StatusServiceUnavailable, "base config not configured (set QUPON_CONFIG)")
			return
		}
		var req seriesCreateRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "body must be SeriesCreateRequest JSON: "+err.Error())
			return
		}
		if err := req.validate(); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", err.Error())
			return
		}
		// A cash mint must be an enabled asset of this network: the registry, not the client, decides what pays.
		if req.CashMint != "" {
			a, err := st.GetCashAsset(r.Context(), assetNetwork(deps), req.CashMint)
			if errors.Is(err, store.ErrNotFound) || (err == nil && !a.Enabled) {
				writeErrorCode(w, http.StatusBadRequest, "asset_not_enabled", "cash asset "+req.CashMint+" is not enabled on this network")
				return
			} else if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}

		// Reserve the name before minting: the second operator gets 409, nothing is minted twice.
		row, err := req.termsRow()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := st.InsertRegistry(r.Context(), row); err != nil {
			if errors.Is(err, store.ErrSeriesExists) {
				writeErrorCode(w, http.StatusConflict, "series_exists", "series "+req.Name+" is already registered")
				return
			}
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := writeExecConfig(deps, st, r); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// argv built from validated fields only (Plan 2 Global Constraints).
		res, err := deps.Executor.Run(r.Context(),
			"series:create",
			"--name", req.Name,
			"--isin", req.ISIN,
			"--face", fmt.Sprintf("%d", req.FaceValue),
			"--rate-bps", fmt.Sprintf("%d", req.CouponRateBps),
			"--frequency", fmt.Sprintf("%d", req.Frequency),
			"--day-count", req.DayCount,
			"--issue-date", req.IssueDate,
			"--maturity-date", req.MaturityDate,
			cashFlag(req), cashValue(req),
		)
		if err == nil && !res.OK {
			err = errors.New(res.Error)
		}
		if err != nil {
			// Roll the placeholder back so a retry is not blocked by series_exists.
			if delErr := st.DeleteRegistry(r.Context(), req.Name); delErr != nil {
				// ponytail: log-free best effort; the row keeps mint "" until the next successful create or manual cleanup
				_ = delErr
			}
			_ = writeExecConfig(deps, st, r)
			audit(st, r, req, false, err.Error(), nil)
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error(), "code": "onchain", "onchainError": err.Error()})
			return
		}

		sigs := res.Signatures
		if sigs == nil {
			sigs = []string{}
		}
		if err := st.UpsertRegistry(r.Context(), store.RegistryRow{Name: req.Name, Mint: res.Mint, Terms: row.Terms}); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := writeExecConfig(deps, st, r); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, req, true, "series "+req.Name+" created (mint "+res.Mint+")", sigs)
		writeJSON(w, http.StatusCreated, map[string]any{"series": req.Name, "mint": res.Mint, "signatures": sigs})
	}
}

// announceRequest is POST /issuer/series/{mint}/actions (openapi.yaml AnnounceRequest).
type announceRequest struct {
	Kind      string `json:"kind"`      // INTR | REDM | MCAL
	RecordAt  int64  `json:"recordAt"`  // record date, unix seconds
	PaymentAt int64  `json:"paymentAt"` // payment date, unix seconds
	CallDate  string `json:"callDate"`  // MCAL only: YYYY-MM-DD
	CorpID    string `json:"corpId"`    // optional, ≤ 16 bytes
}

// validate mirrors the CLI's announcePlan rules (clients/ts/src/commands/action.ts):
// callDate is required for MCAL and rejected otherwise; PCAL stays CLI-only.
func (req *announceRequest) validate() error {
	switch req.Kind {
	case "INTR", "REDM":
		if req.CallDate != "" {
			return errors.New("callDate only applies to MCAL")
		}
	case "MCAL":
		if _, err := time.Parse("2006-01-02", req.CallDate); err != nil {
			return errors.New("MCAL requires callDate YYYY-MM-DD")
		}
	default:
		return errors.New("kind must be INTR, REDM or MCAL")
	}
	if req.RecordAt <= 0 || req.PaymentAt <= req.RecordAt {
		return errors.New("recordAt must be a unix ts strictly before paymentAt")
	}
	if len(req.CorpID) > 16 {
		return errors.New("corpId must be at most 16 bytes")
	}
	return nil
}

// issuerAnnounce: CLI `action:announce` (INTR coupon, REDM at maturity, MCAL
// early call); on-chain schedule checks surface as 409.
func issuerAnnounce(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !needExecutor(w, deps) {
			return
		}
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return
		}
		var req announceRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		if err := req.validate(); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", err.Error())
			return
		}
		name, ok := seriesName(w, deps, mint.String())
		if !ok {
			return
		}
		// argv built from validated fields only (Plan 2 Global Constraints).
		args := []string{
			"action:announce", "--series", name, "--kind", req.Kind,
			"--record-at", strconv.FormatInt(req.RecordAt, 10),
			"--payment-at", strconv.FormatInt(req.PaymentAt, 10),
		}
		if req.CallDate != "" {
			args = append(args, "--call-date", req.CallDate)
		}
		if req.CorpID != "" {
			args = append(args, "--corp-id", req.CorpID)
		}
		res, err := deps.Executor.Run(r.Context(), args...)
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if !res.OK {
			audit(st, r, req, false, res.Error, nil)
			writeOnchainError(w, res.Error)
			return
		}
		sigs := res.Signatures
		if sigs == nil {
			sigs = sigsOf(res.Signature)
		}
		audit(st, r, req, true, req.Kind+" announced", sigs)
		writeJSON(w, http.StatusCreated, map[string]any{"action": res.Action, "signatures": sigs})
	}
}

// meetingRequest is POST /issuer/series/{mint}/meetings (openapi.yaml MeetingRequest).
type meetingRequest struct {
	NewRateBps   int   `json:"newRateBps"`   // proposed coupon rate, 1..10000 bps
	RecordAt     int64 `json:"recordAt"`     // record date, unix seconds
	VotingEndsAt int64 `json:"votingEndsAt"` // voting deadline, unix seconds
}

func (req *meetingRequest) validate() error {
	if req.NewRateBps < 1 || req.NewRateBps > 10000 {
		return errors.New("newRateBps must be 1..10000 bps")
	}
	if req.RecordAt <= 0 || req.VotingEndsAt <= req.RecordAt {
		return errors.New("recordAt must be a unix ts strictly before votingEndsAt")
	}
	return nil
}

// issuerMeeting: CLI `meeting:announce` (bondholder meeting proposing a new
// coupon rate).
func issuerMeeting(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !needExecutor(w, deps) {
			return
		}
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return
		}
		var req meetingRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		if err := req.validate(); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", err.Error())
			return
		}
		name, ok := seriesName(w, deps, mint.String())
		if !ok {
			return
		}
		res, err := deps.Executor.Run(r.Context(),
			"meeting:announce", "--series", name,
			"--record-at", strconv.FormatInt(req.RecordAt, 10),
			"--voting-ends-at", strconv.FormatInt(req.VotingEndsAt, 10),
			"--new-rate-bps", strconv.Itoa(req.NewRateBps))
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if !res.OK {
			audit(st, r, req, false, res.Error, nil)
			writeOnchainError(w, res.Error)
			return
		}
		sigs := res.Signatures
		if sigs == nil {
			sigs = sigsOf(res.Signature)
		}
		audit(st, r, req, true, "BMET announced", sigs)
		writeJSON(w, http.StatusCreated, map[string]any{"action": res.Action, "signatures": sigs})
	}
}

// issuerFund: CLI `action:fund` on the action at {pda}; the CLI fills only
// the shortfall, so a second call is idempotent (skipped:true).
func issuerFund(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Read == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
			return
		}
		if !needExecutor(w, deps) {
			return
		}
		pda, ok := pathKey(w, r, "pda")
		if !ok {
			return
		}
		action, err := deps.Read.FetchCorporateAction(r.Context(), pda)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		if action == nil {
			writeError(w, http.StatusNotFound, "no corporate action at "+pda.String())
			return
		}
		series, err := deps.Read.FetchSeries(r.Context(), action.Series)
		if err != nil || series == nil {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("series %s of action %s: %v", action.Series, pda, err))
			return
		}
		name, ok := seriesName(w, deps, series.Mint.String())
		if !ok {
			return
		}
		res, err := deps.Executor.Run(r.Context(),
			"action:fund", "--series", name,
			"--index", strconv.FormatUint(uint64(action.Index), 10))
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		params := map[string]any{"series": name, "index": action.Index}
		if !res.OK {
			audit(st, r, params, false, res.Error, nil)
			writeOnchainError(w, res.Error)
			return
		}
		sigs := res.Signatures
		if sigs == nil {
			sigs = sigsOf(res.Signature)
		}
		detail := "funded"
		if res.Skipped {
			detail = "skipped: escrow already funded"
		}
		audit(st, r, params, true, detail, sigs)
		writeJSON(w, http.StatusOK, map[string]any{"signatures": sigs, "skipped": res.Skipped})
	}
}

// cashFlag/cashValue pick the CLI's --cash alias or --cash-mint address (validated fields only).
func cashFlag(req seriesCreateRequest) string {
	if req.CashMint != "" {
		return "--cash-mint"
	}
	return "--cash"
}

func cashValue(req seriesCreateRequest) string {
	if req.CashMint != "" {
		return req.CashMint
	}
	return req.Cash
}
