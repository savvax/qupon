package api

// Secondary trades between two registered investors (plan 13, docs/03-domain.md §4a). The trade settles through
// the Solana Foundation's DvP program; Qupon admits its bond escrow and releases it afterwards. The read model
// comes straight from the chain (no CLI process); the writes exec the `trade:*` CLI commands, which put
// create + admit and settle/cancel + release in one transaction each. Not included: order matching, price
// discovery, a trading venue.

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func mountTrades(r chi.Router, deps Deps, st *store.Store) {
	r.Get("/series/{mint}/trades", tradeList(deps, st))

	registrar := requireRole(deps.Auth, "registrar")
	write := demoThrottle(deps.DemoLimit, "demo:")
	r.With(registrar, write).Post("/registrar/series/{mint}/trades", tradeCreate(deps, st))
	r.With(registrar, write).Post("/registrar/series/{mint}/trades/{swapDvp}/settle", tradeClose(deps, st, "settle"))
	r.With(registrar, write).Post("/registrar/series/{mint}/trades/{swapDvp}/cancel", tradeClose(deps, st, "cancel"))

	// The server signs for a demo investor, as the other demo custodial routes do (api.go). The demo registrar may
	// trigger it too, so one person can walk a whole trade on devnet; mainnetGuard refuses every /demo/ write.
	demoFund := requireRole(deps.Auth, "investor_demo", "registrar")
	r.With(demoFund, write).Post("/demo/investor/series/{mint}/trades/{swapDvp}/fund", tradeFundDemo(deps, st))
}

// TradeDTO is one admitted trade with the funding of both legs (same field names as the CLI's trade:list).
type TradeDTO struct {
	SwapDvp     string  `json:"swapDvp"` // the Solana DvP program's trade record
	Escrow      string  `json:"escrow"`  // bond-leg escrow
	Seller      string  `json:"seller"`
	Buyer       string  `json:"buyer"`
	Units       string  `json:"units"`
	CashAmount  Amount  `json:"cashAmount"`
	AdmittedAt  string  `json:"admittedAt"`
	FundedUnits *string `json:"fundedUnits"` // null: the bond escrow account does not exist
	FundedCash  *Amount `json:"fundedCash"`  // null: the cash escrow account does not exist
	Status      string  `json:"status"`      // awaiting_funding | ready | closed
}

// tradeStatus: a missing escrow means the DvP program closed the trade (settled, cancelled or rejected) while the
// admission is still there to release; otherwise the trade is ready once both legs cover their amounts.
func tradeStatus(t *chain.TradeAdmission, bond, cash *chain.TokenAccount) string {
	switch {
	case bond == nil || cash == nil:
		return "closed"
	case bond.Amount >= t.Units && cash.Amount >= t.CashAmount:
		return "ready"
	default:
		return "awaiting_funding"
	}
}

func tradeDTO(t *chain.TradeAdmission, bond, cash *chain.TokenAccount, m money) TradeDTO {
	dto := TradeDTO{
		SwapDvp: t.SwapDvp.String(), Escrow: t.Escrow.String(), Seller: t.Seller.String(), Buyer: t.Buyer.String(),
		Units: strconv.FormatUint(t.Units, 10), CashAmount: m.amount(t.CashAmount), AdmittedAt: dateTime(t.AdmittedAt),
		Status: tradeStatus(t, bond, cash),
	}
	if bond != nil {
		units := strconv.FormatUint(bond.Amount, 10)
		dto.FundedUnits = &units
	}
	if cash != nil {
		amount := m.amount(cash.Amount)
		dto.FundedCash = &amount
	}
	return dto
}

// GET /series/{mint}/trades — the series' admitted trades, oldest first, with both escrow balances.
func tradeList(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rm := deps.Read
		if rm == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
			return
		}
		fail := func(err error) { writeError(w, http.StatusBadGateway, err.Error()) }
		pda, s, m, ok := seriesOf(w, r, rm, st)
		if !ok {
			return
		}
		recs, err := rm.FetchTradeAdmissionsBySeries(r.Context(), pda)
		if err != nil {
			fail(err)
			return
		}
		items := make([]TradeDTO, 0, len(recs))
		if len(recs) > 0 {
			// The cash escrow is the SwapDvp record's associated token account under the cash mint's own token program.
			cashMint, err := rm.GetAccountWithOwner(r.Context(), s.CashMint)
			if err != nil {
				fail(err)
				return
			}
			if cashMint == nil {
				fail(fmt.Errorf("cash mint %s not found", s.CashMint))
				return
			}
			// ponytail: two sequential account reads per trade; switch to getMultipleAccounts if a series ever
			// holds more than a handful of open trades.
			for _, rec := range recs {
				t := rec.Trade
				cashEscrow, _, err := solana.FindAssociatedTokenAddressWithProgram(t.SwapDvp, s.CashMint, cashMint.Owner)
				if err != nil {
					fail(err)
					return
				}
				bond, err := rm.FetchTokenAccount(r.Context(), t.Escrow)
				if err != nil {
					fail(err)
					return
				}
				cash, err := rm.FetchTokenAccount(r.Context(), cashEscrow)
				if err != nil {
					fail(err)
					return
				}
				items = append(items, tradeDTO(t, bond, cash, m))
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"openTrades": s.OpenTrades, "items": items})
	}
}

type tradeCreateRequest struct {
	Seller string `json:"seller"` // registered investor delivering the bonds (wallet, base58)
	Buyer  string `json:"buyer"`  // registered investor paying the cash (wallet, base58)
	Units  uint64 `json:"units"`  // bonds to trade, at par
}

func invalidBody(w http.ResponseWriter, msg string) {
	writeErrorCode(w, http.StatusBadRequest, "invalid_body", msg)
}

// POST /registrar/series/{mint}/trades — trade:create (CreateDvp + admit_trade in one transaction).
func tradeCreate(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !needExecutor(w, deps) {
			return
		}
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return
		}
		var req tradeCreateRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			invalidBody(w, "body must be {seller, buyer, units}: "+err.Error())
			return
		}
		seller, errS := solana.PublicKeyFromBase58(req.Seller)
		buyer, errB := solana.PublicKeyFromBase58(req.Buyer)
		switch {
		case errS != nil || errB != nil:
			invalidBody(w, "seller and buyer must be base58 addresses")
			return
		case seller == buyer:
			invalidBody(w, "seller and buyer must differ")
			return
		case req.Units < 1:
			invalidBody(w, "units must be an integer of at least 1")
			return
		}
		name, ok := seriesName(w, deps, mint.String())
		if !ok {
			return
		}
		res, err := deps.Executor.Run(r.Context(), "trade:create", "--series", name,
			"--seller", seller.String(), "--buyer", buyer.String(), "--units", strconv.FormatUint(req.Units, 10))
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		params := map[string]any{"series": name, "seller": seller.String(), "buyer": buyer.String(), "units": req.Units}
		if !res.OK {
			audit(st, r, params, false, res.Error, nil)
			writeOnchainError(w, res.Error)
			return
		}
		sigs := sigsOf(res.Signature)
		audit(st, r, params, true, "trade:create "+res.SwapDvp, sigs)
		writeJSON(w, http.StatusOK, map[string]any{"signatures": sigs, "swapDvp": res.SwapDvp})
	}
}

// admittedTrade resolves {mint} and {swapDvp} to the CLI series name and the trade's admission, read from the
// chain before any CLI run; false = response written (404 trade_not_found when the series has no such admission).
func admittedTrade(w http.ResponseWriter, r *http.Request, deps Deps) (string, *chain.TradeAdmission, bool) {
	if !needExecutor(w, deps) {
		return "", nil, false
	}
	if deps.Read == nil {
		writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
		return "", nil, false
	}
	mint, ok := pathKey(w, r, "mint")
	if !ok {
		return "", nil, false
	}
	swapDvp, ok := pathKey(w, r, "swapDvp")
	if !ok {
		return "", nil, false
	}
	name, ok := seriesName(w, deps, mint.String())
	if !ok {
		return "", nil, false
	}
	pda, err := deps.Read.SeriesPDA(mint)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return "", nil, false
	}
	recs, err := deps.Read.FetchTradeAdmissionsBySeries(r.Context(), pda)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return "", nil, false
	}
	for _, rec := range recs {
		if rec.Trade.SwapDvp == swapDvp {
			return name, rec.Trade, true
		}
	}
	writeErrorCode(w, http.StatusNotFound, "trade_not_found", "no admitted trade "+swapDvp.String()+" in this series")
	return "", nil, false
}

// POST /registrar/series/{mint}/trades/{swapDvp}/settle|cancel — trade:settle (SettleDvp + release_trade) or
// trade:cancel (CancelDvp + release_trade; force returns the escrowed bonds to the seller without the DvP program).
func tradeClose(deps Deps, st *store.Store, verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Force bool `json:"force"`
		}
		if verb == "cancel" { // the body is optional
			err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req)
			if err != nil && !errors.Is(err, io.EOF) {
				invalidBody(w, "body must be {force?: bool}: "+err.Error())
				return
			}
		}
		name, t, ok := admittedTrade(w, r, deps)
		if !ok {
			return
		}
		args := []string{"trade:" + verb, "--series", name, "--trade", t.SwapDvp.String()}
		if req.Force {
			args = append(args, "--force")
		}
		res, err := deps.Executor.Run(r.Context(), args...)
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		params := map[string]any{"series": name, "trade": t.SwapDvp.String(), "force": req.Force}
		if !res.OK {
			audit(st, r, params, false, res.Error, nil)
			writeOnchainError(w, res.Error)
			return
		}
		sigs := sigsOf(res.Signature)
		audit(st, r, params, true, args[0], sigs)
		out := map[string]any{"signatures": sigs}
		if verb == "cancel" {
			out["returnedUnits"] = strconv.FormatUint(uint64(res.ReturnedUnits), 10)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// demoInvestorEnv names the keypair files of the server-held demo investors (the CLI reads the same variables).
var demoInvestorEnv = [...]string{
	"QUPON_INVESTOR_KEYPAIR", "QUPON_INVESTOR1_KEYPAIR", "QUPON_INVESTOR2_KEYPAIR", "QUPON_INVESTOR3_KEYPAIR",
}

// demoInvestorKeypair returns the path of the configured keypair file whose public key is owner. Only the public
// key is derived here; the file's contents reach neither logs nor responses, and the CLI does the signing.
func demoInvestorKeypair(owner solana.PublicKey) (string, bool) {
	for _, name := range demoInvestorEnv {
		path := os.Getenv(name)
		if path == "" {
			continue
		}
		key, err := solana.PrivateKeyFromSolanaKeygenFile(path)
		if err != nil {
			slog.Warn("demo investor keypair unreadable", "env", name) // the error could quote the file: not logged
			continue
		}
		if key.PublicKey() == owner {
			return path, true
		}
	}
	return "", false
}

// POST /demo/investor/series/{mint}/trades/{swapDvp}/fund — trade:fund signed by the server-held keypair of the
// chosen party. The CLI re-reads the on-chain record and refuses terms that differ before it transfers.
func tradeFundDemo(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Side string `json:"side"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			invalidBody(w, "body must be {side}: "+err.Error())
			return
		}
		if req.Side != "seller" && req.Side != "buyer" {
			invalidBody(w, `side must be "seller" or "buyer"`)
			return
		}
		name, t, ok := admittedTrade(w, r, deps)
		if !ok {
			return
		}
		party := t.Seller
		if req.Side == "buyer" {
			party = t.Buyer
		}
		keypair, ok := demoInvestorKeypair(party)
		if !ok {
			writeErrorCode(w, http.StatusForbidden, "not_demo_investor", "the "+req.Side+" "+party.String()+" is not a demo investor: they fund from their own wallet")
			return
		}
		runDemo(w, r, deps, st, map[string]any{"series": name, "trade": t.SwapDvp.String(), "side": req.Side},
			"trade:fund", "--series", name, "--trade", t.SwapDvp.String(), "--side", req.Side, "--keypair", keypair)
	}
}
