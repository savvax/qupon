// Package notice renders KASE-style disclosure notices (EN/RU/KK) from
// on-chain action state, following docs/03-domain.md §7 and fixtures/notices goldens.
package notice

import (
	"errors"
	"fmt"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"strings"
)

// Kind identifies the corporate-action kind (mirrors chain.CorporateAction.Kind).
type Kind uint8

// Action kinds.
const (
	KindINTR Kind = 0
	KindREDM Kind = 1
	KindMCAL Kind = 2
	KindPCAL Kind = 3
	KindBMET Kind = 4
	KindCHAN Kind = 5

	// Synthetic notice kinds with no on-chain enum value: the reader derives them
	// from action state — a Defaulted action (status 10) and a cured one
	// (defaulted_at ≠ 0 ∧ cured_at ≠ 0). 100+ never collides with chain kinds.
	KindDEFAULT Kind = 100
	KindCURE    Kind = 101
)

// ErrUnsupportedKind is returned for kinds without a notice template.
var ErrUnsupportedKind = errors.New("notice: unsupported action kind")

// Data carries everything a notice template needs. Amounts are in minor units.
type Data struct {
	Kind            Kind
	Lang            string // "en" or "ru"
	CouponNumber    int    // INTR: 1-based coupon sequence
	PaymentDate     string // ISO 8601
	IssuerName      string
	ISIN            string
	Ticker          string
	TotalNet        uint64 // INTR/REDM total net paid, minor units
	Ccy             string
	Decimals        uint8 // cash mint decimals; amounts below are minor units of it (0 = already whole units)
	Holders         int
	RecordDate      string // ISO 8601, start of day Almaty
	TxLinks         []string
	NextCouponDate  string // INTR only
	Principal       uint64 // REDM/MCAL, minor units
	FinalCoupon     uint64 // REDM, minor units
	Days            uint32 // MCAL accrued period
	AccruedNetMinor uint64 // MCAL, 2-decimal rendering
	OldRateBps      uint32 // CHAN
	NewRateBps      uint32 // CHAN
	EffectiveDate   string // CHAN/BMET
	MeetingDate     string // BMET only: when the bondholders' meeting concluded
	Approved        bool   // BMET only: the proposed terms change passed
	DueDate         string // DEFAULT/CURE: the missed payment date
	DefaultDate     string // DEFAULT/CURE: when the default was declared
	CureDate        string // CURE only: when late funding cured the default
}

// OrdinalEN renders 1st, 2nd, 3rd, 4th…
func OrdinalEN(n int) string {
	suffix := "th"
	switch n % 100 {
	case 11, 12, 13:
	default:
		switch n % 10 {
		case 1:
			suffix = "st"
		case 2:
			suffix = "nd"
		case 3:
			suffix = "rd"
		}
	}
	return fmt.Sprintf("%d%s", n, suffix)
}

// OrdinalRU renders "1-й", "2-й"…
func OrdinalRU(n int) string { return fmt.Sprintf("%d-й", n) }

// OrdinalKK renders "1-ші", "2-ші"… (the common Kazakh ordinal suffix).
func OrdinalKK(n int) string { return fmt.Sprintf("%d-ші", n) }

// Amount renders an integer minor-unit amount with thousands separators.
func Amount(v uint64) string {
	s := fmt.Sprintf("%d", v)
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// money renders minor units of a mint with `dec` decimals: (500000, 2) → "5,000.00".
func money(v uint64, dec uint8) string {
	if dec == 0 {
		return Amount(v)
	}
	p := uint64(1)
	for range dec {
		p *= 10
	}
	return fmt.Sprintf("%s.%0*d", Amount(v/p), int(dec), v%p)
}

// Amount2 renders a minor-unit amount with a 2-decimal fraction (e.g. 1,874.20).
func Amount2(v uint64) string { return fmt.Sprintf("%s.%02d", Amount(v/100), v%100) }

// explorerLink is the explorer link for a tx signature on this instance's network.
func explorerLink(sig string) string { return network.ExplorerURL("tx", sig) }

// PlaceholderTxLink is used when no settled transaction signature is known yet.
func PlaceholderTxLink() string { return network.ExplorerURL("tx", "<TX_SIGNATURE>") }

func txLinks(links []string) string {
	out := make([]string, 0, len(links))
	for _, l := range links {
		if !strings.Contains(l, "/") {
			l = explorerLink(l)
		}
		out = append(out, l)
	}
	if len(out) == 0 {
		out = append(out, PlaceholderTxLink())
	}
	return strings.Join(out, " ")
}

func pct(bps uint32) string { return fmt.Sprintf("%.2f%%", float64(bps)/100) }

// Render produces the notice text (one line, KASE headline style).
func Render(d Data) (string, error) {
	links := txLinks(d.TxLinks)
	switch d.Kind {
	case KindINTR:
		return renderINTR(d, links)
	case KindREDM:
		return renderREDM(d, links)
	case KindMCAL:
		return renderMCAL(d, links)
	case KindCHAN:
		return renderCHAN(d, links)
	case KindPCAL:
		return renderPCAL(d, links)
	case KindBMET:
		return renderBMET(d, links)
	case KindDEFAULT:
		return renderDefault(d, links)
	case KindCURE:
		return renderCure(d, links)
	default:
		return "", fmt.Errorf("%w: %d", ErrUnsupportedKind, uint8(d.Kind))
	}
}

func renderINTR(d Data, links string) (string, error) {
	switch d.Lang {
	case "en":
		return fmt.Sprintf("/KASE, %s/ – %s has paid the %s coupon on its bonds %s (%s). "+
			"Amount paid: %s %s to %d holders of record as of %s (start of day, Almaty). "+
			"Payment was settled on Solana devnet, transaction(s): %s. "+
			"The next coupon payment is scheduled for %s.",
			d.PaymentDate, d.IssuerName, OrdinalEN(d.CouponNumber), d.ISIN, d.Ticker,
			money(d.TotalNet, d.Decimals), d.Ccy, d.Holders, d.RecordDate, links, d.NextCouponDate), nil
	case "ru":
		return fmt.Sprintf("/KASE, %s/ – %s выплатил(а) %s купон по облигациям %s (%s). "+
			"Сумма выплаты: %s %s, держателей: %d, дата фиксации реестра: %s (начало дня, Алматы). "+
			"Расчёты проведены в Solana devnet, транзакции: %s. "+
			"Следующая выплата купона: %s.",
			d.PaymentDate, d.IssuerName, OrdinalRU(d.CouponNumber), d.ISIN, d.Ticker,
			money(d.TotalNet, d.Decimals), d.Ccy, d.Holders, d.RecordDate, links, d.NextCouponDate), nil
	case "kk":
		return fmt.Sprintf("/KASE, %s/ – %s %s (%s) облигациялары бойынша %s купонді төледі. "+
			"Төлем сомасы: %s %s, ұстаушылар саны: %d, реестрді тіркеу күні: %s (күннің басы, Алматы). "+
			"Есеп айырысу Solana devnet желісінде жүргізілді, транзакциялар: %s. "+
			"Келесі купон төлемі: %s.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker, OrdinalKK(d.CouponNumber),
			money(d.TotalNet, d.Decimals), d.Ccy, d.Holders, d.RecordDate, links, d.NextCouponDate), nil
	default:
		return "", fmt.Errorf("notice: unsupported lang %q", d.Lang)
	}
}

func renderREDM(d Data, links string) (string, error) {
	total := d.Principal + d.FinalCoupon
	switch d.Lang {
	case "en":
		return fmt.Sprintf("/KASE, %s/ – %s has paid the principal and the final coupon on its bonds %s (%s) "+
			"in connection with redemption at maturity. Principal paid: %s %s, final coupon: %s %s, total: %s %s "+
			"to %d holders of record as of %s (start of day, Almaty). "+
			"Payment was settled on Solana devnet, transaction(s): %s. The bonds have been delisted from KASE.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, money(d.FinalCoupon, d.Decimals), d.Ccy, money(total, d.Decimals), d.Ccy,
			d.Holders, d.RecordDate, links), nil
	case "ru":
		return fmt.Sprintf("/KASE, %s/ – %s выплатил(а) номинальную стоимость и последний купон "+
			"по облигациям %s (%s) в связи с погашением при наступлении срока. "+
			"Номинальная стоимость: %s %s, последний купон: %s %s, итого: %s %s, держателей: %d, "+
			"дата фиксации реестра: %s (начало дня, Алматы). "+
			"Расчёты проведены в Solana devnet, транзакции: %s. Облигации исключены из списка KASE.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, money(d.FinalCoupon, d.Decimals), d.Ccy, money(total, d.Decimals), d.Ccy,
			d.Holders, d.RecordDate, links), nil
	case "kk":
		return fmt.Sprintf("/KASE, %s/ – %s %s (%s) облигацияларының мерзімі жеткен өтеуіне байланысты "+
			"номиналдық құнын және соңғы купонін төледі. "+
			"Номиналдық құн: %s %s, соңғы купон: %s %s, барлығы: %s %s, ұстаушылар: %d, "+
			"реестрді тіркеу күні: %s (күннің басы, Алматы). "+
			"Есеп айырысу Solana devnet желісінде жүргізілді, транзакциялар: %s. Облигациялар KASE тізімінен алынды.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, money(d.FinalCoupon, d.Decimals), d.Ccy, money(total, d.Decimals), d.Ccy,
			d.Holders, d.RecordDate, links), nil
	default:
		return "", fmt.Errorf("notice: unsupported lang %q", d.Lang)
	}
}

func renderMCAL(d Data, links string) (string, error) {
	switch d.Lang {
	case "en":
		return fmt.Sprintf("/KASE, %s/ – %s has completed the full early redemption of its bonds %s (%s). "+
			"Principal paid: %s %s, accrued coupon for %d days: %s %s net of tax, "+
			"to %d holders of record as of %s (start of day, Almaty). "+
			"Payment was settled on Solana devnet, transaction(s): %s. The bonds have been delisted from KASE.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, d.Days, Amount2(d.AccruedNetMinor), d.Ccy,
			d.Holders, d.RecordDate, links), nil
	case "ru":
		return fmt.Sprintf("/KASE, %s/ – %s завершил(а) полное досрочное погашение своих облигаций %s (%s). "+
			"Номинальная стоимость: %s %s, накопленный купон за %d дней: %s %s за вычетом налога, "+
			"держателей: %d, дата фиксации реестра: %s (начало дня, Алматы). "+
			"Расчёты проведены в Solana devnet, транзакции: %s. Облигации исключены из списка KASE.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, d.Days, Amount2(d.AccruedNetMinor), d.Ccy,
			d.Holders, d.RecordDate, links), nil
	case "kk":
		return fmt.Sprintf("/KASE, %s/ – %s %s (%s) облигацияларының толық ерте өтеуін аяқтады. "+
			"Номиналдық құн: %s %s, %d күнге жинақталған купон: салық шегерілгеннен кейін %s %s, "+
			"ұстаушылар: %d, реестрді тіркеу күні: %s (күннің басы, Алматы). "+
			"Есеп айырысу Solana devnet желісінде жүргізілді, транзакциялар: %s. Облигациялар KASE тізімінен алынды.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, d.Days, Amount2(d.AccruedNetMinor), d.Ccy,
			d.Holders, d.RecordDate, links), nil
	default:
		return "", fmt.Errorf("notice: unsupported lang %q", d.Lang)
	}
}

func renderCHAN(d Data, links string) (string, error) {
	switch d.Lang {
	case "en":
		return fmt.Sprintf("/KASE, %s/ – %s has announced changes to the prospectus of its bonds %s (%s) "+
			"registered: coupon rate %s → %s per annum, effective from %s. "+
			"Trading in the bonds continues on KASE. Details: %s.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			pct(d.OldRateBps), pct(d.NewRateBps), d.EffectiveDate, links), nil
	case "ru":
		return fmt.Sprintf("/KASE, %s/ – %s сообщил(а) о регистрации изменений в проспекте выпуска "+
			"своих облигаций %s (%s): ставка купона %s → %s годовых с %s. "+
			"Торги облигациями на KASE продолжаются. Подробности: %s.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			pct(d.OldRateBps), pct(d.NewRateBps), d.EffectiveDate, links), nil
	case "kk":
		return fmt.Sprintf("/KASE, %s/ – %s %s (%s) облигацияларының проспектісіне өзгерістер тіркелгені "+
			"туралы хабарлады: купон мөлшерлемесі %s → %s жылдық, %s бастап қолданысқа енгізіледі. "+
			"Облигациялардың KASE-тегі саудасы жалғасуда. Толығырақ: %s.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			pct(d.OldRateBps), pct(d.NewRateBps), d.EffectiveDate, links), nil
	default:
		return "", fmt.Errorf("notice: unsupported lang %q", d.Lang)
	}
}

// renderPCAL: partial early redemption by factor (amortization) — units are kept,
// face value is reduced (docs/03-domain.md §4).
func renderPCAL(d Data, links string) (string, error) {
	switch d.Lang {
	case "en":
		return fmt.Sprintf("/KASE, %s/ – %s has completed the partial early redemption (amortization) of its bonds %s (%s). "+
			"Principal paid: %s %s to %d holders of record as of %s (start of day, Almaty). "+
			"Payment was settled on Solana devnet, transaction(s): %s. The bonds remain listed on KASE; "+
			"the outstanding face value is reduced accordingly.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, d.Holders, d.RecordDate, links), nil
	case "ru":
		return fmt.Sprintf("/KASE, %s/ – %s осуществил(а) частичное досрочное погашение (амортизацию) облигаций %s (%s). "+
			"Погашённая часть номинала: %s %s, держателей: %d, дата фиксации реестра: %s (начало дня, Алматы). "+
			"Расчёты проведены в Solana devnet, транзакции: %s. Торги облигациями на KASE продолжаются; "+
			"остаточная номинальная стоимость уменьшена соответствующим образом.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, d.Holders, d.RecordDate, links), nil
	case "kk":
		return fmt.Sprintf("/KASE, %s/ – %s %s (%s) облигацияларының ішінара ерте өтеуін (амортизациясын) аяқтады. "+
			"Өтелген номиналдың бөлігі: %s %s, ұстаушылар: %d, реестрді тіркеу күні: %s (күннің басы, Алматы). "+
			"Есеп айырысу Solana devnet желісінде жүргізілді, транзакциялар: %s. Облигациялардың KASE-тегі "+
			"саудасы жалғасуда; қалдық номиналдық құн тиісінше азайтылды.",
			d.PaymentDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.Principal, d.Decimals), d.Ccy, d.Holders, d.RecordDate, links), nil
	default:
		return "", fmt.Errorf("notice: unsupported lang %q", d.Lang)
	}
}

// renderBMET: the bondholder-meeting outcome notice (headline date = the
// meeting date; only an approved meeting carries an effective date).
func renderBMET(d Data, links string) (string, error) {
	old, new := pct(d.OldRateBps), pct(d.NewRateBps)
	switch d.Lang {
	case "en":
		if d.Approved {
			return fmt.Sprintf("/KASE, %s/ – the bondholders' meeting on the bonds %s (%s) of %s approved "+
				"the change to the prospectus: coupon rate %s → %s per annum, effective from %s. "+
				"Voting was recorded on Solana devnet, transaction(s): %s.",
				d.MeetingDate, d.ISIN, d.Ticker, d.IssuerName, old, new, d.EffectiveDate, links), nil
		}
		return fmt.Sprintf("/KASE, %s/ – the bondholders' meeting on the bonds %s (%s) of %s did not approve "+
			"the proposed change to the prospectus (coupon rate %s → %s per annum). "+
			"Voting was recorded on Solana devnet, transaction(s): %s.",
			d.MeetingDate, d.ISIN, d.Ticker, d.IssuerName, old, new, links), nil
	case "ru":
		if d.Approved {
			return fmt.Sprintf("/KASE, %s/ – собрание владельцев облигаций %s (%s) эмитента %s одобрило "+
				"изменение проспекта выпуска: ставка купона %s → %s годовых с %s. "+
				"Голосование зафиксировано в Solana devnet, транзакции: %s.",
				d.MeetingDate, d.ISIN, d.Ticker, d.IssuerName, old, new, d.EffectiveDate, links), nil
		}
		return fmt.Sprintf("/KASE, %s/ – собрание владельцев облигаций %s (%s) эмитента %s не одобрило "+
			"предложенное изменение проспекта выпуска (ставка купона %s → %s годовых). "+
			"Голосование зафиксировано в Solana devnet, транзакции: %s.",
			d.MeetingDate, d.ISIN, d.Ticker, d.IssuerName, old, new, links), nil
	case "kk":
		if d.Approved {
			return fmt.Sprintf("/KASE, %s/ – %s эмитентінің %s (%s) облигациялары бойынша ұстаушылар жиналысы "+
				"проспектіге өзгерісті мақұлдады: купон мөлшерлемесі %s → %s жылдық, %s бастап қолданысқа енгізіледі. "+
				"Дауыс беру Solana devnet желісінде тіркелді, транзакциялар: %s.",
				d.MeetingDate, d.IssuerName, d.ISIN, d.Ticker, old, new, d.EffectiveDate, links), nil
		}
		return fmt.Sprintf("/KASE, %s/ – %s эмитентінің %s (%s) облигациялары бойынша ұстаушылар жиналысы "+
			"проспектіге ұсынылған өзгерісті мақұлдамады (купон мөлшерлемесі %s → %s жылдық). "+
			"Дауыс беру Solana devnet желісінде тіркелді, транзакциялар: %s.",
			d.MeetingDate, d.IssuerName, d.ISIN, d.Ticker, old, new, links), nil
	default:
		return "", fmt.Errorf("notice: unsupported lang %q", d.Lang)
	}
}

// renderDefault: an unfunded action past its grace period was declared in
// default (plan 15 D4); claims stay on the on-chain entitlements.
func renderDefault(d Data, links string) (string, error) {
	switch d.Lang {
	case "en":
		return fmt.Sprintf("/KASE, %s/ – %s is in default on its bonds %s (%s): the payment of %s %s due %s "+
			"to %d holders of record as of %s (start of day, Almaty) was not made within the grace period. "+
			"The default is recorded on Solana devnet, transaction(s): %s.",
			d.DefaultDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.TotalNet, d.Decimals), d.Ccy, d.DueDate, d.Holders, d.RecordDate, links), nil
	case "ru":
		return fmt.Sprintf("/KASE, %s/ – %s допустил(а) дефолт по облигациям %s (%s): выплата %s %s со сроком %s "+
			"в пользу %d держателей (дата фиксации реестра: %s, начало дня, Алматы) не была произведена "+
			"в льготный период. Дефолт зафиксирован в Solana devnet, транзакции: %s.",
			d.DefaultDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.TotalNet, d.Decimals), d.Ccy, d.DueDate, d.Holders, d.RecordDate, links), nil
	case "kk":
		return fmt.Sprintf("/KASE, %s/ – %s %s (%s) облигациялары бойынша дефолтқа ұшырады: %s күні мерзімі "+
			"өткен %s %s төлемі (реестрді тіркеу күні: %s, күннің басы, Алматы) %d ұстаушыға жеңілдік "+
			"мерзімінде жасалмады. Дефолт Solana devnet желісінде тіркелді, транзакциялар: %s.",
			d.DefaultDate, d.IssuerName, d.ISIN, d.Ticker,
			d.DueDate, money(d.TotalNet, d.Decimals), d.Ccy, d.RecordDate, d.Holders, links), nil
	default:
		return "", fmt.Errorf("notice: unsupported lang %q", d.Lang)
	}
}

// renderCure: the issuer's late funding cured a declared default (plan 15 D4).
func renderCure(d Data, links string) (string, error) {
	switch d.Lang {
	case "en":
		return fmt.Sprintf("/KASE, %s/ – %s has cured the default on its bonds %s (%s): the overdue payment "+
			"of %s %s (due %s, declared in default on %s) has been funded for %d holders of record "+
			"as of %s (start of day, Almaty). Payment was settled on Solana devnet, transaction(s): %s.",
			d.CureDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.TotalNet, d.Decimals), d.Ccy, d.DueDate, d.DefaultDate, d.Holders, d.RecordDate, links), nil
	case "ru":
		return fmt.Sprintf("/KASE, %s/ – %s устранил(а) дефолт по облигациям %s (%s): просроченная выплата "+
			"%s %s (срок %s, дефолт объявлен %s) в пользу %d держателей (дата фиксации реестра: %s, "+
			"начало дня, Алматы) профинансирована. Расчёты проведены в Solana devnet, транзакции: %s.",
			d.CureDate, d.IssuerName, d.ISIN, d.Ticker,
			money(d.TotalNet, d.Decimals), d.Ccy, d.DueDate, d.DefaultDate, d.Holders, d.RecordDate, links), nil
	case "kk":
		return fmt.Sprintf("/KASE, %s/ – %s %s (%s) облигациялары бойынша дефолтты жойды: %d ұстаушыға "+
			"(реестрді тіркеу күні: %s, күннің басы, Алматы) мерзімі өткен %s %s төлемі (мерзімі %s, "+
			"дефолт %s жарияланған) қаржыландырылды. Есеп айырысу Solana devnet желісінде жүргізілді, транзакциялар: %s.",
			d.CureDate, d.IssuerName, d.ISIN, d.Ticker,
			d.Holders, d.RecordDate, money(d.TotalNet, d.Decimals), d.Ccy, d.DueDate, d.DefaultDate, links), nil
	default:
		return "", fmt.Errorf("notice: unsupported lang %q", d.Lang)
	}
}
