package termsheet

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// SIMULATED: the regex fallback knows the KASE English and Russian listing /
// news phrasing ("face value – 1,000 tenge", "купонная ставка – 15,95 %",
// "semi-annual" / "полугодовой", "30/360", dates 03.07.2026 / July 3, 2026 /
// 3 июля 2026 / 2026-07-03). It is a demo stand-in for the model, not a parser
// of arbitrary prospectuses.

const (
	numRe  = `(\d{1,3}(?:[ \x{00a0}]\d{3})+|\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{1,2}))?`
	dateRe = `(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4})`
)

var (
	isinRe     = regexp.MustCompile(`^[A-Z]{2}[A-Z0-9]{9}[0-9]$`)
	isinFindRe = regexp.MustCompile(`\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b`)
	tickerRe   = regexp.MustCompile(`^[A-Za-z0-9]{2,12}$`)
	// KASE trade code: 4-letter issuer code + lowercase board suffix + issue number (BTRKb33, KZTGe1).
	tickerFindRe = regexp.MustCompile(`\b([A-Z]{4}[a-z]{1,2}\d{1,3})\b`)
	currencyRe   = regexp.MustCompile(`^[A-Z]{3}$`)

	issuerRe = regexp.MustCompile(`(?i)(?:^|[\n;])\s*(?:issuer|эмитент)\s*[–—:-]\s*([^;\n]+)`)
	faceRe   = regexp.MustCompile(`(?i)(?:face value|nominal value|par value|номинальн[а-яё]+\s+стоимост[а-яё]+|номинал)\D{0,40}?` + numRe + `\s*(KZT|tenge|тенге|USD|EUR|RUB)`)
	rateRe   = regexp.MustCompile(`(?i)(?:coupon|interest rate|купон[а-яё]*|ставк[а-яё]*)\D{0,60}?(\d{1,2}(?:[.,]\d{1,2})?)\s*%`)
	anyRate  = regexp.MustCompile(`(\d{1,2}(?:[.,]\d{1,2})?)\s*%`)

	freqRes = []struct {
		re *regexp.Regexp
		n  int
	}{
		{regexp.MustCompile(`(?i)semi-?annual|twice a year|two times a year|2 times a year|полугод|два раза в год|2 раза в год`), 2},
		{regexp.MustCompile(`(?i)quarterly|four times a year|4 times a year|ежекварт|четыре раза в год|4 раза в год`), 4},
		{regexp.MustCompile(`(?i)monthly|twelve times a year|12 times a year|ежемесяч|12 раз в год`), 12},
		{regexp.MustCompile(`(?i)\bannual|once a year|one time a year|1 time a year|ежегод|один раз в год|1 раз в год|раз в год`), 1},
	}
	dayCountRes = []struct {
		re *regexp.Regexp
		v  string
	}{
		{regexp.MustCompile(`30\s*/\s*360`), "THIRTY_360"},
		{regexp.MustCompile(`(?i)act(?:ual)?\s*/\s*365`), "ACT_365"},
		{regexp.MustCompile(`(?i)act(?:ual)?\s*/\s*act(?:ual)?`), "ACT_ACT"},
	}

	rangeRe    = regexp.MustCompile(dateRe + `\s*(?:[–—-]|to|по|до)\s*` + dateRe)
	issueRe    = regexp.MustCompile(`(?i)(?:circulation start|start of circulation|issue date|date of issue|placement date|начал[а-яё]*\s+обращени[а-яё]*|дат[а-яё]*\s+выпуска|дат[а-яё]*\s+размещения)\D{0,40}?` + dateRe)
	maturityRe = regexp.MustCompile(`(?i)(?:maturity|redemption date|date of redemption|погашени[а-яё]*)\D{0,40}?` + dateRe)

	ruMonths = map[string]time.Month{"января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
		"июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12}
)

// Regex extracts Terms with the SIMULATED fallback; fields it cannot find are "missing".
func Regex(text string) Terms {
	t := emptyTerms()
	for _, m := range isinFindRe.FindAllStringSubmatch(text, -1) {
		if ValidISIN(m[1]) {
			t.ISIN = field(m[1], "high")
			break
		}
	}
	if m := tickerFindRe.FindStringSubmatch(text); m != nil {
		t.Ticker = field(m[1], "medium")
	}
	if m := issuerRe.FindStringSubmatch(text); m != nil {
		if n := cleanName(m[1]); n != "" {
			t.IssuerName = field(n, "medium")
		}
	}
	if m := faceRe.FindStringSubmatch(text); m != nil {
		if v, ok := parseNumber(m[1], m[2]); ok {
			if minor, ok := toMinor(v); ok {
				t.FaceValue = field(minor, "high")
				t.Currency = field(currency(m[3]), "high")
			}
		}
	}
	if m := rateRe.FindStringSubmatch(text); m != nil {
		if pct, err := strconv.ParseFloat(strings.ReplaceAll(m[1], ",", "."), 64); err == nil {
			if bps, ok := toBps(pct); ok {
				t.CouponBps = field(bps, "high")
			}
		}
	} else if m := anyRate.FindStringSubmatch(text); m != nil {
		if pct, err := strconv.ParseFloat(strings.ReplaceAll(m[1], ",", "."), 64); err == nil {
			if bps, ok := toBps(pct); ok {
				t.CouponBps = field(bps, "low")
			}
		}
	}
	for _, f := range freqRes { // semi-annual is tested before annual on purpose
		if f.re.MatchString(text) {
			t.Frequency = field(f.n, "high")
			break
		}
	}
	for _, d := range dayCountRes {
		if d.re.MatchString(text) {
			t.DayCount = field(d.v, "high")
			break
		}
	}
	if m := rangeRe.FindStringSubmatch(text); m != nil {
		if a, ok := parseDate(m[1]); ok {
			if b, ok := parseDate(m[2]); ok {
				t.IssueDate, t.MaturityDate = field(a, "high"), field(b, "high")
			}
		}
	}
	if m := issueRe.FindStringSubmatch(text); m != nil && t.IssueDate.Confidence == Missing {
		if d, ok := parseDate(m[1]); ok {
			t.IssueDate = field(d, "medium")
		}
	}
	if m := maturityRe.FindStringSubmatch(text); m != nil && t.MaturityDate.Confidence == Missing {
		if d, ok := parseDate(m[1]); ok {
			t.MaturityDate = field(d, "medium")
		}
	}
	return checkDates(t)
}

func currency(s string) string {
	switch strings.ToLower(s) {
	case "tenge", "тенге":
		return "KZT"
	}
	return strings.ToUpper(s)
}

// parseNumber joins the integer part (thousands separated by space, nbsp or
// comma) with an optional 1–2 digit fraction (after "." or ",").
func parseNumber(intPart, frac string) (float64, bool) {
	clean := strings.NewReplacer(" ", "", " ", "", ",", "").Replace(intPart)
	if frac != "" {
		clean += "." + frac
	}
	v, err := strconv.ParseFloat(clean, 64)
	return v, err == nil
}

// parseDate accepts 03.07.2026, 2026-07-03, July 3, 2026 and 3 июля 2026 → YYYY-MM-DD.
func parseDate(s string) (string, bool) {
	s = strings.Join(strings.Fields(s), " ")
	for _, layout := range []string{"02.01.2006", "2006-01-02", "January 2, 2006"} {
		if d, err := time.Parse(layout, s); err == nil {
			return d.Format("2006-01-02"), true
		}
	}
	parts := strings.Split(s, " ")
	if len(parts) == 3 {
		if m, ok := ruMonths[strings.ToLower(parts[1])]; ok {
			day, err1 := strconv.Atoi(parts[0])
			year, err2 := strconv.Atoi(parts[2])
			if err1 == nil && err2 == nil && day >= 1 && day <= 31 {
				d := time.Date(year, m, day, 0, 0, 0, 0, time.UTC)
				if d.Day() == day {
					return d.Format("2006-01-02"), true
				}
			}
		}
	}
	return "", false
}
