package kase

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// Bond is the normalised kase.kz bond (spec §5.5): dates YYYY-MM-DD, rates in
// basis points, face in minor units of the bond currency (KZT: tiyn).
type Bond struct {
	Ticker       string          `json:"ticker"`
	ISIN         string          `json:"isin"`
	Issuer       string          `json:"issuer"`
	IssuerCode   string          `json:"issuerCode"`
	Currency     string          `json:"currency"`
	Face         int64           `json:"face"`
	CouponRate   int64           `json:"couponRate"` // bps per year
	Frequency    int             `json:"frequency"`  // coupons per year (0 = unknown)
	IssueDate    string          `json:"issueDate"`
	MaturityDate string          `json:"maturityDate"`
	Schedule     []ScheduleEntry `json:"schedule"`
	Market       Market          `json:"market"`
	Stale        bool            `json:"stale"`
	FetchedAt    string          `json:"fetchedAt"`
}

// ScheduleEntry is one coupon period (recordDate = kase fixation date).
type ScheduleEntry struct {
	RecordDate string `json:"recordDate"`
	Start      string `json:"start"`
	End        string `json:"end"`
	Rate       int64  `json:"rate"` // bps
}

// Market is the current quote snapshot from the bond list entry; LastDeals is
// the raw last-deals JSON (its shape varies between instruments, so it passes
// through for the UI).
type Market struct {
	Price     *float64        `json:"price"` // % of nominal, clean
	Bid       *float64        `json:"bid"`
	Offer     *float64        `json:"offer"`
	Volume    *float64        `json:"volume"` // KZT
	Date      string          `json:"date"`
	LastDeals json.RawMessage `json:"lastDeals,omitempty"`
}

// News is the normalised issuer news feed.
type News struct {
	Issuer    string     `json:"issuer"`
	Lang      string     `json:"lang"`
	Items     []NewsItem `json:"items"`
	Stale     bool       `json:"stale"`
	FetchedAt string     `json:"fetchedAt"`
}

// NewsItem is one kase.kz company news release.
type NewsItem struct {
	ID       int64  `json:"id"`
	Date     string `json:"date"` // kase create_datetime
	Language string `json:"language"`
	Subject  string `json:"subject"`
	Body     string `json:"body"`
}

// raw shapes of the captured kase.kz bodies (internal/kase/testdata).

type rawBond struct {
	Code       string   `json:"code"`
	Price      *float64 `json:"price"`
	BestBid    *float64 `json:"best_bid"`
	BestOffer  *float64 `json:"best_offer"`
	VolKZT     *float64 `json:"volkzt"`
	Date0      string   `json:"date0"`
	OrgCode    string   `json:"org_code"`
	OrgNameEn  string   `json:"org_name_en"`
	OrgNameRu  string   `json:"org_name_ru"`
	OrgShortEn string   `json:"org_short_name_en"`
	OrgShortRu string   `json:"org_short_name_ru"`
	Currency   string   `json:"currency_type"`
	Ticker     struct {
		NIN        string   `json:"nin"` // ISIN
		Currency   string   `json:"currency"`
		Cupon      *float64 `json:"cupon"`
		InclDate   string   `json:"incl_date"`
		OpenTrade  string   `json:"open_trade_date"`
		FinishDate string   `json:"finish_date"`
	} `json:"ticker"`
}

type rawChar struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type rawCoupon struct {
	FixationDate string   `json:"fixation_date"`
	StartDate    string   `json:"start_date"`
	EndDate      string   `json:"end_date"`
	Rate         *float64 `json:"rate"`
}

type rawTradeInfo struct {
	Date0 string `json:"date0"`
}

type rawNews struct {
	Results []struct {
		ID       int64  `json:"id"`
		Datetime string `json:"create_datetime"`
		Language string `json:"language"`
		Subject  string `json:"subject"`
		Body     string `json:"body"`
	} `json:"results"`
}

// NormalizeBond builds the DTO from the raw kase.kz bodies. Every body except
// the bond snapshot is optional (nil = that kase.kz endpoint failed; the DTO
// degrades instead of erroring).
func NormalizeBond(bond, characteristics, coupons, tradeInfo, lastDeals []byte) (Bond, error) {
	var rb rawBond
	if err := json.Unmarshal(bond, &rb); err != nil {
		return Bond{}, fmt.Errorf("%w: bond body: %v", ErrUnavailable, err)
	}
	out := Bond{
		Ticker:       rb.Code,
		ISIN:         rb.Ticker.NIN,
		Issuer:       firstNonEmpty(rb.OrgShortEn, rb.OrgNameEn, rb.OrgShortRu, rb.OrgNameRu),
		IssuerCode:   rb.OrgCode,
		Currency:     firstNonEmpty(rb.Currency, rb.Ticker.Currency),
		IssueDate:    dateOnly(rb.Ticker.OpenTrade),
		MaturityDate: dateOnly(rb.Ticker.FinishDate),
		Market: Market{
			Price:  rb.Price,
			Bid:    rb.BestBid,
			Offer:  rb.BestOffer,
			Volume: rb.VolKZT,
			Date:   dateOnly(rb.Date0),
		},
	}
	if rb.Ticker.Cupon != nil {
		out.CouponRate = bps(*rb.Ticker.Cupon)
	}

	// Characteristics: keyed by kase.kz's stable numeric ids, with a label scan
	// as the fallback for instruments that miss an id.
	if chars := parseChars(characteristics); chars != nil {
		if v, ok := chars.value("482", "Номинальная стоимость"); ok {
			if f, ok := parseNumber(v); ok {
				out.Face = int64(math.Round(f * 100)) // minor units: KZT and every currency kase quotes here has 2
			}
		}
		if v, ok := chars.value("541", "купонная ставка"); ok {
			if f, ok := parseNumber(v); ok {
				out.CouponRate = bps(f)
			}
		}
		if v, ok := chars.value("479", "Валюта выпуска"); ok && out.Currency == "" {
			out.Currency = strings.TrimSpace(v)
		}
		if v, ok := chars.value("848", "ISIN"); ok && out.ISIN == "" {
			out.ISIN = strings.TrimSpace(v)
		}
	}

	if len(coupons) > 0 {
		var rc []rawCoupon
		if err := json.Unmarshal(coupons, &rc); err != nil {
			return Bond{}, fmt.Errorf("%w: coupon body: %v", ErrUnavailable, err)
		}
		out.Schedule = make([]ScheduleEntry, 0, len(rc))
		for _, c := range rc {
			if c.Rate == nil {
				continue
			}
			out.Schedule = append(out.Schedule, ScheduleEntry{
				RecordDate: dateOnly(c.FixationDate), Start: dateOnly(c.StartDate), End: dateOnly(c.EndDate), Rate: bps(*c.Rate),
			})
		}
		out.Frequency = frequency(out.Schedule)
	}

	if len(tradeInfo) > 0 {
		var rt []rawTradeInfo
		if err := json.Unmarshal(tradeInfo, &rt); err == nil && len(rt) > 0 && rt[0].Date0 != "" {
			// trade-info's newest row is a fresher date than the bond list entry.
			out.Market.Date = dateOnly(rt[0].Date0)
		}
	}

	if len(lastDeals) > 0 {
		out.Market.LastDeals = json.RawMessage(lastDeals)
	}
	return out, nil
}

// NormalizeNews builds the issuer news feed.
func NormalizeNews(issuer, lang string, body []byte) (News, error) {
	var rn rawNews
	if err := json.Unmarshal(body, &rn); err != nil {
		return News{}, fmt.Errorf("%w: news body: %v", ErrUnavailable, err)
	}
	out := News{Issuer: issuer, Lang: lang, Items: make([]NewsItem, 0, len(rn.Results))}
	for _, it := range rn.Results {
		out.Items = append(out.Items, NewsItem{ID: it.ID, Date: it.Datetime, Language: it.Language, Subject: it.Subject, Body: it.Body})
	}
	return out, nil
}

type charList struct {
	ids    map[string]string
	labels []rawChar
}

func parseChars(body []byte) *charList {
	if len(body) == 0 {
		return nil
	}
	chars := map[string]rawChar{}
	if err := json.Unmarshal(body, &chars); err != nil {
		return nil // degrade: fields filled from the other bodies
	}
	cl := &charList{ids: map[string]string{}}
	for id, c := range chars {
		cl.ids[id] = c.Value
		cl.labels = append(cl.labels, c)
	}
	return cl
}

func (cl *charList) value(id, labelNeedle string) (string, bool) {
	if v, ok := cl.ids[id]; ok && strings.TrimSpace(v) != "" {
		return v, true
	}
	for _, c := range cl.labels {
		if strings.Contains(strings.ToLower(c.Label), strings.ToLower(labelNeedle)) {
			return c.Value, true
		}
	}
	return "", false
}

// frequency derives coupons per year from the median gap between period starts.
func frequency(schedule []ScheduleEntry) int {
	if len(schedule) < 2 {
		return 0
	}
	gaps := make([]int, 0, len(schedule)-1)
	for i := 1; i < len(schedule); i++ {
		d := daysBetween(schedule[i-1].Start, schedule[i].Start)
		if d > 0 {
			gaps = append(gaps, d)
		}
	}
	if len(gaps) == 0 {
		return 0
	}
	sort.Ints(gaps)
	switch d := gaps[len(gaps)/2]; {
	case d > 300:
		return 1
	case d > 150:
		return 2
	case d > 80:
		return 4
	default:
		return 12
	}
}

// bps converts a kase.kz percent value (8.5 = 8.5 %) to basis points.
func bps(percent float64) int64 { return int64(math.Round(percent * 100)) }

// daysBetween returns whole days between two YYYY-MM-DD dates (0 when unparseable).
func daysBetween(from, to string) int {
	f, err1 := time.Parse("2006-01-02", from)
	t, err2 := time.Parse("2006-01-02", to)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(t.Sub(f).Hours() / 24)
}

// parseNumber reads kase.kz formatted numbers: "8,000", "4 500 000 000",
// "0,01" (comma decimal, space/nbsp thousands).
func parseNumber(s string) (float64, bool) {
	s = strings.Map(func(r rune) rune {
		if r == ' ' || r == 0xa0 || r == 0x202f {
			return -1
		}
		return r
	}, strings.TrimSpace(s))
	s = strings.ReplaceAll(s, ",", ".")
	var f float64
	if _, err := fmt.Sscanf(s, "%g", &f); err != nil {
		return 0, false
	}
	return f, true
}

// dateOnly truncates kase datetimes ("2026-10-06", "2026-10-05 16:59:40",
// "2012-03-07T16:58:44") to YYYY-MM-DD.
func dateOnly(s string) string {
	if i := strings.IndexAny(s, "T "); i == 10 {
		return s[:10]
	} else if i >= 0 {
		return s[:i]
	}
	return s
}

func firstNonEmpty(ss ...string) string {
	for _, s := range ss {
		if s != "" {
			return s
		}
	}
	return ""
}
