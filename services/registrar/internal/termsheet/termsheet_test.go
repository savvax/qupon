package termsheet

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// BTRKb33 listing (docs/research/01-market-kase-iso20022-prior-art.md) in the
// KASE news phrasing, EN and RU.
const (
	btrkEN = `Bonds KZ2C00018703 (BTRKb33) of National Managing Holding Baiterek JSC included in KASE official list

From July 3, 2026, bonds KZ2C00018703 (KASE official list, "bonds" category, BTRKb33) of National Managing Holding Baiterek JSC are included in the KASE official list.
Main characteristics of the bonds:
issuer – National Managing Holding Baiterek JSC;
type of securities – coupon bonds;
face value – 1,000 tenge;
issue volume – 50,000,000,000 tenge;
coupon rate – 15.95% per annum;
coupon payment frequency – 2 times a year (semi-annual);
day count convention – 30/360;
circulation term – 5 years;
circulation period – 03.07.2026 – 03.07.2031;
maturity date – 03.07.2031.`

	btrkRU = `Облигации KZ2C00018703 (BTRKb33) АО "НУХ "Байтерек" включены в официальный список KASE

С 3 июля 2026 года облигации KZ2C00018703 (официальный список KASE, категория "облигации", BTRKb33) АО "Национальный управляющий холдинг "Байтерек" включены в официальный список KASE.
Основные характеристики облигаций:
эмитент – АО "Национальный управляющий холдинг "Байтерек";
вид ценных бумаг – купонные облигации;
номинальная стоимость одной облигации – 1 000 тенге;
объем выпуска – 50 000 000 000 тенге;
ставка купонного вознаграждения – 15,95 % годовых;
периодичность выплаты купона – 2 раза в год (полугодовой);
база расчета – 30/360;
срок обращения – 5 лет;
дата начала обращения – 3 июля 2026 года;
дата погашения – 3 июля 2031 года.`
)

func expectBTRK(t *testing.T, got Terms) {
	t.Helper()
	want := []struct {
		name string
		got  any
		want any
		conf string
	}{
		{"isin", got.ISIN.Value, "KZ2C00018703", got.ISIN.Confidence},
		{"ticker", got.Ticker.Value, "BTRKb33", got.Ticker.Confidence},
		{"face", got.FaceValue.Value, int64(100000), got.FaceValue.Confidence},
		{"currency", got.Currency.Value, "KZT", got.Currency.Confidence},
		{"bps", got.CouponBps.Value, int64(1595), got.CouponBps.Confidence},
		{"frequency", got.Frequency.Value, 2, got.Frequency.Confidence},
		{"dayCount", got.DayCount.Value, "THIRTY_360", got.DayCount.Confidence},
		{"issue", got.IssueDate.Value, "2026-07-03", got.IssueDate.Confidence},
		{"maturity", got.MaturityDate.Value, "2031-07-03", got.MaturityDate.Confidence},
	}
	for _, w := range want {
		if w.got != w.want || w.conf == Missing {
			t.Errorf("%s = %v (%s), want %v", w.name, w.got, w.conf, w.want)
		}
	}
	if !strings.Contains(got.IssuerName.Value, "Байтерек") && !strings.Contains(got.IssuerName.Value, "Baiterek") {
		t.Errorf("issuer = %q", got.IssuerName.Value)
	}
}

func TestRegexBTRKb33(t *testing.T) {
	for _, tc := range []struct{ name, text string }{{"en", btrkEN}, {"ru", btrkRU}} {
		t.Run(tc.name, func(t *testing.T) {
			got, src, err := (*Extractor)(nil).Extract(t.Context(), tc.text)
			if err != nil || src != SourceRegex {
				t.Fatalf("source %q err %v", src, err)
			}
			expectBTRK(t, got)
		})
	}
}

func TestRegexVariants(t *testing.T) {
	cases := []struct {
		name string
		text string
		want func(Terms) bool
	}{
		{"iso dates and quarterly", "ISIN KZ2P00018476, nominal value 1000.00 KZT, coupon 22% per annum paid quarterly, ACT/365, 2026-01-15 to 2027-12-31",
			func(x Terms) bool {
				return x.FaceValue.Value == 100000 && x.CouponBps.Value == 2200 && x.Frequency.Value == 4 &&
					x.DayCount.Value == "ACT_365" && x.IssueDate.Value == "2026-01-15" && x.MaturityDate.Value == "2027-12-31"
			}},
		{"bad check digit is dropped", "bonds KZ2C00018704 face value 1,000 tenge",
			func(x Terms) bool { return x.ISIN.Confidence == Missing && x.FaceValue.Value == 100000 }},
		{"maturity before issue drops both", "issue date 03.07.2031, maturity date 03.07.2026",
			func(x Terms) bool { return x.IssueDate.Confidence == Missing && x.MaturityDate.Confidence == Missing }},
		{"nothing", "hello world", func(x Terms) bool { return allMissing(x) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Regex(tc.text); !tc.want(got) {
				b, _ := json.Marshal(got)
				t.Errorf("got %s", b)
			}
		})
	}
}

func TestValidISIN(t *testing.T) {
	for s, ok := range map[string]bool{
		"KZ2C00018703": true, "US0378331005": true, "KZ2C00000065": true,
		"KZ2C00018704": false, "KZ2C0001870": false, "kz2c00018703": false, "": false,
	} {
		if got := ValidISIN(s); got != ok {
			t.Errorf("ValidISIN(%q) = %v, want %v", s, got, ok)
		}
	}
}

func llmServer(t *testing.T, content string, delay time.Duration) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var req struct {
			Model    string `json:"model"`
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Model != "glm-test" || len(req.Messages) != 2 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		time.Sleep(delay)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"role": "assistant", "content": content}}},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

const cannedAnswer = "```json\n" + `{"isin":"KZ2C00018703","ticker":"BTRKb33","issuerName":"NMH Baiterek JSC","faceValue":1000,"currency":"KZT","couponRatePct":15.95,"frequency":2,"dayCount":"THIRTY_360","issueDate":"2026-07-03","maturityDate":"2031-07-03","confidence":{"isin":"high","faceValue":"high","couponRatePct":"medium"}}` + "\n```"

func TestLLM(t *testing.T) {
	t.Run("canned answer", func(t *testing.T) {
		srv := llmServer(t, cannedAnswer, 0)
		e := &Extractor{URL: srv.URL, Model: "glm-test", Key: "test-key"}
		got, src, err := e.Extract(t.Context(), "any text")
		if err != nil || src != SourceLLM {
			t.Fatalf("source %q err %v", src, err)
		}
		expectBTRK(t, got)
		if got.ISIN.Confidence != "high" || got.CouponBps.Confidence != "medium" || got.Frequency.Confidence != "low" {
			t.Errorf("confidence not carried: %+v", got)
		}
	})
	t.Run("invalid ISIN check digit is rejected", func(t *testing.T) {
		srv := llmServer(t, strings.Replace(cannedAnswer, "KZ2C00018703", "KZ2C00018704", 1), 0)
		e := &Extractor{URL: srv.URL, Model: "glm-test", Key: "test-key"}
		got, src, _ := e.Extract(t.Context(), "any text")
		if src != SourceLLM || got.ISIN.Confidence != Missing || got.ISIN.Value != "" {
			t.Fatalf("source %q isin %+v", src, got.ISIN)
		}
	})
	t.Run("garbage answer falls back to regex", func(t *testing.T) {
		srv := llmServer(t, "I cannot help with that.", 0)
		e := &Extractor{URL: srv.URL, Model: "glm-test", Key: "test-key"}
		got, src, err := e.Extract(t.Context(), btrkEN)
		if err != nil || src != SourceRegex {
			t.Fatalf("source %q err %v", src, err)
		}
		expectBTRK(t, got)
	})
	t.Run("timeout falls back to regex", func(t *testing.T) {
		srv := llmServer(t, cannedAnswer, 300*time.Millisecond)
		e := &Extractor{URL: srv.URL, Model: "glm-test", Key: "test-key", Timeout: 50 * time.Millisecond}
		got, src, err := e.Extract(t.Context(), btrkRU)
		if err != nil || src != SourceRegex {
			t.Fatalf("source %q err %v", src, err)
		}
		expectBTRK(t, got)
	})
	t.Run("empty and oversized text", func(t *testing.T) {
		if _, _, err := (*Extractor)(nil).Extract(t.Context(), "  "); err == nil {
			t.Error("empty accepted")
		}
		if _, _, err := (*Extractor)(nil).Extract(t.Context(), strings.Repeat("x", MaxText+1)); err == nil {
			t.Error("oversized accepted")
		}
	})
}

func TestFromEnv(t *testing.T) {
	t.Setenv("TERMSHEET_LLM_KEY", "")
	t.Setenv("ZAI_API_KEY", "")
	if FromEnv() != nil {
		t.Fatal("no key should give nil")
	}
	t.Setenv("ZAI_API_KEY", "k")
	if e := FromEnv(); e == nil || e.Key != "k" || e.URL != "" {
		t.Fatalf("fallback key: %+v", e)
	}
}
