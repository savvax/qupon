package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// The curated public showcase (plan 15, task 1535): four demo series on the judging-length clock (one
// civil day = 1 h, task 91553), one per corporate-action scenario, each with a distinct human ticker and an ISIN of the form KZ2C0QPN000N whose
// last digit is a valid Luhn check digit. Task 1540 creates the data on devnet from these definitions —
// the serial 1..4 doubles as the board order, because GET /series lists featured series by ISIN
// (rest.go). The seed endpoint marks the four featured and hides judge sandboxes (demo-clock series no
// admin curated).

// ShowcaseSeries is one curated demo series; enough for 1540 to create it and run its scenario.
type ShowcaseSeries struct {
	// Scenario names the sandbox scenario that drives the series (coupon | redemption | meeting | early_call).
	Scenario string `json:"scenario"`
	// Ticker is the human title shown on the public board; it must fit the on-chain 16-byte ticker field.
	Ticker         string `json:"ticker"`
	ISIN           string `json:"isin"`
	FaceMinor      uint64 `json:"faceMinor"`      // 100_000 tiyn = 1,000 ₸ (the brief)
	RateBps        uint32 `json:"rateBps"`        // 1000 = 10 % (the brief)
	Frequency      uint8  `json:"frequency"`      // coupons per year (2 = semi-annual)
	MaturityMonths uint8  `json:"maturityMonths"` // life of the bond in civil months
	// DaySecs is the accelerated clock: one civil day lasts this many seconds (0 would be the real clock).
	DaySecs uint32 `json:"daySecs"`
}

// Showcase is the single definition of the public board's curated series, in board order.
var Showcase = []ShowcaseSeries{
	{Scenario: "coupon", Ticker: "Almaty Power", ISIN: "KZ2C0QPN0018",
		FaceMinor: 100_000, RateBps: 1000, Frequency: 2, MaturityMonths: 12, DaySecs: 3600},
	{Scenario: "redemption", Ticker: "Astana Metro", ISIN: "KZ2C0QPN0026",
		FaceMinor: 100_000, RateBps: 1000, Frequency: 2, MaturityMonths: 6, DaySecs: 3600},
	{Scenario: "meeting", Ticker: "Aktobe Mining", ISIN: "KZ2C0QPN0034",
		FaceMinor: 100_000, RateBps: 1000, Frequency: 2, MaturityMonths: 9, DaySecs: 3600},
	{Scenario: "early_call", Ticker: "Atyrau Oil", ISIN: "KZ2C0QPN0042",
		FaceMinor: 100_000, RateBps: 1000, Frequency: 2, MaturityMonths: 8, DaySecs: 3600},
}

// IsinCheckDigit returns the Luhn check digit of an 11-character ISIN base (ISO 6166: letters become
// their alphabet position + 9 as two digits, every second digit is doubled from the right).
func IsinCheckDigit(base string) int {
	sum := 0
	double := true // the rightmost digit is doubled first (ISO 6166)
	for i := len(base) - 1; i >= 0; i-- {
		c := base[i]
		var d [2]int
		n := 1 // a decimal char contributes one digit, a letter two (A = 10 … Z = 35)
		switch {
		case c >= '0' && c <= '9':
			d[0] = int(c - '0')
		case c >= 'A' && c <= 'Z':
			v := int(c-'A') + 10
			d[0], d[1], n = v/10, v%10, 2
		default:
			return -1
		}
		for j := n - 1; j >= 0; j-- { // right to left, also within a letter's two digits
			v := d[j]
			if double {
				v *= 2
				if v > 9 {
					v -= 9
				}
			}
			sum += v
			double = !double
		}
	}
	return (10 - sum%10) % 10
}

// ValidISIN reports whether isin is 12 characters matching ^KZ2C0QPN\d{4}$ with a correct check digit.
func ValidISIN(isin string) bool {
	if len(isin) != 12 || !strings.HasPrefix(isin, "KZ2C0QPN") {
		return false
	}
	for _, c := range isin[8:] {
		if c < '0' || c > '9' {
			return false
		}
	}
	return int(isin[11]-'0') == IsinCheckDigit(isin[:11])
}

// upstreamError marks a failed chain read inside SeedShowcase: the HTTP handler answers 502
// (bad gateway) for those and 500 for store failures — the split the endpoint always had.
type upstreamError struct{ err error }

func (e upstreamError) Error() string { return e.err.Error() }
func (e upstreamError) Unwrap() error { return e.err }

func mountShowcase(r chi.Router, deps Deps, st *store.Store) {
	gate := requireRole(deps.Auth, "admin")
	r.With(gate).Post("/admin/showcase/seed", showcaseSeed(deps, st))
}

// ShowcaseSeedResult reports what one seed pass did (the endpoint body and the log line share it).
type ShowcaseSeedResult struct {
	Seeded  []string `json:"seeded"`  // showcase mints now featured, in board order
	Hidden  []string `json:"hidden"`  // demo-clock mints hidden from the public board
	Missing []string `json:"missing"` // showcase ISINs with no matching series on the definition's clock
}

// SeedShowcase marks every showcase series found on chain featured (matched by ISIN, on the
// definition's clock, latest issue) and hides demo-clock series nobody curated (judge sandboxes
// stay reachable by link but leave the public board). Idempotent; extracted from the endpoint
// body so SHOWCASE_AUTOSEED can run it on a loop without an admin (task 91558).
func SeedShowcase(ctx context.Context, deps Deps, st *store.Store) (ShowcaseSeedResult, error) {
	var res ShowcaseSeedResult
	settings, err := st.ListSeriesSettings(ctx)
	if err != nil {
		return res, err
	}
	want := map[string]uint32{} // ISIN → the definition's demo clock
	for _, d := range Showcase {
		want[d.ISIN] = d.DaySecs
	}
	pickedIssue := map[string]int64{} // ISIN → IssueDate of the series picked so far
	byISIN := map[string]string{}     // ISIN → mint
	demoMints := []string{}           // every series on the accelerated clock
	if deps.Read != nil {
		recs, err := deps.Read.AllSeries(ctx)
		if err != nil {
			return res, upstreamError{err}
		}
		for _, rec := range recs {
			isin := strings.TrimRight(string(rec.Series.ISIN[:]), "\x00")
			// A re-seed leaves the old showcase on chain under the same ISIN: feature the series on the definition's
			// clock, the most recently issued one (2026-10-11: the 4 s showcase was re-issued at 1 h per day).
			if clock, ok := want[isin]; ok && rec.Series.DaySecs == clock && rec.Series.IssueDate >= pickedIssue[isin] {
				byISIN[isin] = rec.Series.Mint.String()
				pickedIssue[isin] = rec.Series.IssueDate
			}
			if rec.Series.DaySecs > 0 {
				demoMints = append(demoMints, rec.Series.Mint.String())
			}
		}
	} else { // no chain reader: the startup mirror rows carry the same fields as SeriesDTO
		rows, err := st.ListSeries(ctx)
		if err != nil {
			return res, err
		}
		for _, row := range rows {
			var view struct {
				Mint      string `json:"mint"`
				ISIN      string `json:"isin"`
				DemoClock *struct {
					DaySecs int `json:"daySecs"`
				} `json:"demoClock"`
			}
			if json.Unmarshal(row.Data, &view) == nil {
				if clock, ok := want[view.ISIN]; ok && view.DemoClock != nil && uint32(view.DemoClock.DaySecs) == clock {
					byISIN[view.ISIN] = row.Mint
				}
				if view.DemoClock != nil {
					demoMints = append(demoMints, row.Mint)
				}
			}
		}
	}

	for _, d := range Showcase {
		mint, ok := byISIN[d.ISIN]
		if !ok {
			res.Missing = append(res.Missing, d.ISIN)
			continue
		}
		x := settings[mint]
		x.SeriesMint, x.Featured, x.Hidden = mint, true, false
		if err := st.UpsertSeriesSettings(ctx, x); err != nil {
			return res, err
		}
		res.Seeded = append(res.Seeded, mint)
	}
	for _, mint := range demoMints {
		if slices.Contains(res.Seeded, mint) || settings[mint].Featured {
			continue // the showcase itself, and anything an admin already curated, stay public
		}
		x := settings[mint]
		x.SeriesMint, x.Hidden = mint, true
		if err := st.UpsertSeriesSettings(ctx, x); err != nil {
			return res, err
		}
		res.Hidden = append(res.Hidden, mint)
	}
	return res, nil
}

// showcaseSeed keeps the endpoint's contract: 502 for chain-read failures, 500 for store
// failures, the result as JSON and an audit row.
func showcaseSeed(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		res, err := SeedShowcase(r.Context(), deps, st)
		if err != nil {
			status := http.StatusInternalServerError
			var up upstreamError
			if errors.As(err, &up) {
				status = http.StatusBadGateway
			}
			writeError(w, status, err.Error())
			return
		}
		audit(st, r, map[string]any{"seeded": res.Seeded, "hidden": res.Hidden, "missing": res.Missing},
			true, "showcase seeded", nil)
		writeJSON(w, http.StatusOK, res)
	}
}
