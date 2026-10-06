// Package termsheet turns pasted KASE listing / news text into structured
// series terms (task 042, EXPERIMENTAL). Two sources: an OpenAI-compatible LLM
// (Z.ai GLM by default) and a SIMULATED regex fallback for the demo. Every
// field is validated here and confirmed by the issuer in the wizard before it
// reaches the chain; the model's free text is never trusted beyond the fields.
package termsheet

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"strings"
	"time"
)

// Source is where the terms came from.
type Source string

const (
	SourceLLM   Source = "llm"
	SourceRegex Source = "regex" // SIMULATED fallback

	// MaxText caps the pasted text (request size limit).
	MaxText = 64 << 10

	// Z.ai's OpenAI-compatible endpoint (https://docs.z.ai/api-reference/llm/chat-completion).
	defaultURL   = "https://api.z.ai/api/paas/v4/chat/completions"
	defaultModel = "glm-5.3"
)

// Field is one extracted value with a confidence: high | medium | low, or
// "missing" when the text had nothing usable (Value is then the zero value).
type Field[T any] struct {
	Value      T      `json:"value"`
	Confidence string `json:"confidence"`
}

// Missing is the confidence of an absent or rejected field.
const Missing = "missing"

func missing[T any]() Field[T] { return Field[T]{Confidence: Missing} }

func field[T any](v T, conf string) Field[T] {
	if conf == "" {
		conf = "medium"
	}
	return Field[T]{Value: v, Confidence: conf}
}

// Terms are the wizard's series fields. FaceValue is in minor units of Currency
// (1,000.00 KZT = 100000); CouponBps is the annual rate in basis points.
type Terms struct {
	ISIN         Field[string] `json:"isin"`
	Ticker       Field[string] `json:"ticker"`
	IssuerName   Field[string] `json:"issuerName"`
	FaceValue    Field[int64]  `json:"faceValue"`
	Currency     Field[string] `json:"currency"`
	CouponBps    Field[int64]  `json:"couponBps"`
	Frequency    Field[int]    `json:"frequency"`
	DayCount     Field[string] `json:"dayCount"`
	IssueDate    Field[string] `json:"issueDate"`
	MaturityDate Field[string] `json:"maturityDate"`
}

var (
	ErrEmpty    = errors.New("termsheet: empty text")
	ErrTooLarge = errors.New("termsheet: text exceeds 64 KB")
)

// Extractor calls an OpenAI-compatible chat-completions API. A nil *Extractor
// (no key configured) extracts through the SIMULATED regex path only.
type Extractor struct {
	URL     string
	Model   string
	Key     string
	Timeout time.Duration // whole LLM call incl. the one retry; 0 = 20 s
	HTTP    *http.Client  // nil = http.DefaultClient
}

// FromEnv reads TERMSHEET_LLM_URL, TERMSHEET_LLM_MODEL and TERMSHEET_LLM_KEY
// (falling back to ZAI_API_KEY). Without a key it returns nil → regex only.
func FromEnv() *Extractor {
	key := os.Getenv("TERMSHEET_LLM_KEY")
	if key == "" {
		key = os.Getenv("ZAI_API_KEY")
	}
	if key == "" {
		return nil
	}
	return &Extractor{URL: os.Getenv("TERMSHEET_LLM_URL"), Model: os.Getenv("TERMSHEET_LLM_MODEL"), Key: key}
}

// Extract parses text with the LLM when one is configured, else (or when the
// LLM fails or answers nothing valid) with the SIMULATED regex fallback.
func (e *Extractor) Extract(ctx context.Context, text string) (Terms, Source, error) {
	switch {
	case strings.TrimSpace(text) == "":
		return Terms{}, "", ErrEmpty
	case len(text) > MaxText:
		return Terms{}, "", ErrTooLarge
	}
	if e != nil && e.Key != "" {
		t, err := e.llm(ctx, text)
		if err == nil {
			return t, SourceLLM, nil
		}
		// No key, no prompt: the reason only.
		slog.WarnContext(ctx, "termsheet: llm failed, using SIMULATED regex fallback", "err", err)
	}
	return Regex(text), SourceRegex, nil
}

// ---- LLM path -------------------------------------------------------------

const systemPrompt = `You extract bond terms from a KASE (Kazakhstan Stock Exchange) listing announcement or news item, in English or Russian.
Answer with ONE JSON object and nothing else, following exactly this schema (use null for anything the text does not state; never guess):
{"isin": string|null, "ticker": string|null, "issuerName": string|null, "faceValue": number|null, "currency": "KZT"|"USD"|"EUR"|"RUB"|null,
 "couponRatePct": number|null, "frequency": 1|2|4|12|null, "dayCount": "THIRTY_360"|"ACT_365"|"ACT_ACT"|null,
 "issueDate": "YYYY-MM-DD"|null, "maturityDate": "YYYY-MM-DD"|null,
 "confidence": {"<field>": "high"|"medium"|"low"}}
faceValue is the nominal per bond in major currency units; couponRatePct is the annual coupon in percent; frequency is coupon payments per year (semi-annual = 2, quarterly = 4); issueDate is the circulation start.
Example answer for "Bonds KZ2C00018703 (BTRKb33) of NMH Baiterek JSC: face value 1,000 tenge, coupon 15.95% per annum paid semi-annually, 30/360, circulation 03.07.2026 - 03.07.2031":
{"isin":"KZ2C00018703","ticker":"BTRKb33","issuerName":"NMH Baiterek JSC","faceValue":1000,"currency":"KZT","couponRatePct":15.95,"frequency":2,"dayCount":"THIRTY_360","issueDate":"2026-07-03","maturityDate":"2031-07-03","confidence":{"isin":"high","ticker":"high","issuerName":"high","faceValue":"high","currency":"high","couponRatePct":"high","frequency":"high","dayCount":"high","issueDate":"high","maturityDate":"high"}}`

// llmAnswer is the model's JSON; pointers so null and absent read as missing.
type llmAnswer struct {
	ISIN          *string           `json:"isin"`
	Ticker        *string           `json:"ticker"`
	IssuerName    *string           `json:"issuerName"`
	FaceValue     *float64          `json:"faceValue"`
	Currency      *string           `json:"currency"`
	CouponRatePct *float64          `json:"couponRatePct"`
	Frequency     *int              `json:"frequency"`
	DayCount      *string           `json:"dayCount"`
	IssueDate     *string           `json:"issueDate"`
	MaturityDate  *string           `json:"maturityDate"`
	Confidence    map[string]string `json:"confidence"`
}

func (e *Extractor) llm(ctx context.Context, text string) (Terms, error) {
	timeout := e.Timeout
	if timeout == 0 {
		timeout = 20 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	url, model := e.URL, e.Model
	if url == "" {
		url = defaultURL
	}
	if model == "" {
		model = defaultModel
	}
	// response_format is Z.ai-documented and OpenAI-compatible. No `thinking` field: GLM-5.3 refuses
	// "disabled" (HTTP 400, code 1210) and answers with the JSON in `content` anyway (checked 2026-10-07).
	body, err := json.Marshal(map[string]any{
		"model":           model,
		"temperature":     0.1,
		"response_format": map[string]string{"type": "json_object"},
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": text},
		},
	})
	if err != nil {
		return Terms{}, fmt.Errorf("termsheet: marshal: %w", err)
	}
	client := e.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	var resp *http.Response
	for attempt := range 2 { // one retry on a network error
		req, rerr := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if rerr != nil {
			return Terms{}, fmt.Errorf("termsheet: request: %w", rerr)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+e.Key)
		resp, err = client.Do(req)
		if err == nil || ctx.Err() != nil || attempt == 1 {
			break
		}
	}
	if err != nil {
		return Terms{}, fmt.Errorf("termsheet: llm call: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return Terms{}, fmt.Errorf("termsheet: read answer: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return Terms{}, fmt.Errorf("termsheet: llm answered %d", resp.StatusCode)
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || len(out.Choices) == 0 {
		return Terms{}, fmt.Errorf("termsheet: unexpected completion shape: %w", err)
	}
	content := out.Choices[0].Message.Content
	// Tolerate a ```json fence: keep the outermost object.
	if i, j := strings.Index(content, "{"), strings.LastIndex(content, "}"); i >= 0 && j > i {
		content = content[i : j+1]
	}
	var a llmAnswer
	if err := json.Unmarshal([]byte(content), &a); err != nil {
		return Terms{}, fmt.Errorf("termsheet: model answer is not the JSON schema: %w", err)
	}
	t := a.validate()
	if allMissing(t) {
		return Terms{}, errors.New("termsheet: model answer had no valid field")
	}
	return t, nil
}

func allMissing(t Terms) bool {
	return t.ISIN.Confidence == Missing && t.Ticker.Confidence == Missing && t.FaceValue.Confidence == Missing &&
		t.CouponBps.Confidence == Missing && t.Frequency.Confidence == Missing && t.DayCount.Confidence == Missing &&
		t.IssueDate.Confidence == Missing && t.MaturityDate.Confidence == Missing
}

// validate keeps only values that pass the same rules as the API/on-chain
// init_series; anything else becomes "missing". Confidence is clamped to the
// three known levels.
func (a llmAnswer) validate() Terms {
	conf := func(k string) string {
		switch c := a.Confidence[k]; c {
		case "high", "medium", "low":
			return c
		}
		return "low"
	}
	t := emptyTerms()
	if a.ISIN != nil && ValidISIN(strings.ToUpper(strings.TrimSpace(*a.ISIN))) {
		t.ISIN = field(strings.ToUpper(strings.TrimSpace(*a.ISIN)), conf("isin"))
	}
	if a.Ticker != nil && tickerRe.MatchString(strings.TrimSpace(*a.Ticker)) {
		t.Ticker = field(strings.TrimSpace(*a.Ticker), conf("ticker"))
	}
	if a.IssuerName != nil {
		if n := cleanName(*a.IssuerName); n != "" {
			t.IssuerName = field(n, conf("issuerName"))
		}
	}
	if a.FaceValue != nil {
		if minor, ok := toMinor(*a.FaceValue); ok {
			t.FaceValue = field(minor, conf("faceValue"))
		}
	}
	if a.Currency != nil {
		if c := strings.ToUpper(strings.TrimSpace(*a.Currency)); currencyRe.MatchString(c) {
			t.Currency = field(c, conf("currency"))
		}
	}
	if a.CouponRatePct != nil {
		if bps, ok := toBps(*a.CouponRatePct); ok {
			t.CouponBps = field(bps, conf("couponRatePct"))
		}
	}
	if a.Frequency != nil && validFrequency(*a.Frequency) {
		t.Frequency = field(*a.Frequency, conf("frequency"))
	}
	if a.DayCount != nil && validDayCount(*a.DayCount) {
		t.DayCount = field(*a.DayCount, conf("dayCount"))
	}
	if a.IssueDate != nil && validDate(*a.IssueDate) {
		t.IssueDate = field(*a.IssueDate, conf("issueDate"))
	}
	if a.MaturityDate != nil && validDate(*a.MaturityDate) {
		t.MaturityDate = field(*a.MaturityDate, conf("maturityDate"))
	}
	return checkDates(t)
}

// ---- shared validation ------------------------------------------------------

func emptyTerms() Terms {
	return Terms{
		ISIN: missing[string](), Ticker: missing[string](), IssuerName: missing[string](),
		FaceValue: missing[int64](), Currency: missing[string](), CouponBps: missing[int64](),
		Frequency: missing[int](), DayCount: missing[string](), IssueDate: missing[string](), MaturityDate: missing[string](),
	}
}

// ValidISIN checks the ISO 6166 shape and Luhn check digit (letters expand to
// their 10..35 values before the mod-10 test).
func ValidISIN(s string) bool {
	if !isinRe.MatchString(s) {
		return false
	}
	var digits []int
	for _, r := range s {
		if r >= 'A' && r <= 'Z' {
			v := int(r-'A') + 10
			digits = append(digits, v/10, v%10)
		} else {
			digits = append(digits, int(r-'0'))
		}
	}
	sum := 0
	double := false // the rightmost digit (the check digit) is not doubled
	for i := len(digits) - 1; i >= 0; i-- {
		d := digits[i]
		if double {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
		double = !double
	}
	return sum%10 == 0
}

func validFrequency(f int) bool { return f == 1 || f == 2 || f == 4 || f == 12 }

func validDayCount(d string) bool { return d == "THIRTY_360" || d == "ACT_365" || d == "ACT_ACT" }

func validDate(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

// toMinor converts a major-unit face value into 2-decimal minor units.
func toMinor(v float64) (int64, bool) {
	if !(v > 0) || v > 1e12 || math.IsInf(v, 0) {
		return 0, false
	}
	return int64(math.Round(v * 100)), true
}

// toBps converts an annual percent rate into basis points, 0..10000.
func toBps(pct float64) (int64, bool) {
	if math.IsNaN(pct) || pct < 0 || pct > 100 {
		return 0, false
	}
	return int64(math.Round(pct * 100)), true
}

// checkDates drops both dates when issue >= maturity.
func checkDates(t Terms) Terms {
	if t.IssueDate.Confidence != Missing && t.MaturityDate.Confidence != Missing && t.IssueDate.Value >= t.MaturityDate.Value {
		t.IssueDate, t.MaturityDate = missing[string](), missing[string]()
	}
	return t
}

// cleanName keeps a printable, single-line issuer name of at most 120 chars.
func cleanName(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	s = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, s)
	if len(s) > 120 {
		s = s[:120]
	}
	return strings.TrimRight(s, " .,;:")
}
