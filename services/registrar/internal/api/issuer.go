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
	"time"

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
	Cash          string `json:"cash"`
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
	if req.Cash != "tkzt" && req.Cash != "usdc" {
		return errors.New("cash must be tkzt or usdc")
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
	cashMint := "tKZT"
	if req.Cash == "usdc" {
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "body must be SeriesCreateRequest JSON: "+err.Error())
			return
		}
		if err := req.validate(); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", err.Error())
			return
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
			"--cash", req.Cash,
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
