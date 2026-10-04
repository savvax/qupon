package entitlement

import (
	"math"
	"math/big"
	"testing"
)

// refCompute is a math/big reference implementation of the exact Rust
// semantics: u128 checked intermediates, u64 finals, half-up rounding. The
// production path uses the math/bits u128 emulation; fuzzing cross-checks the
// two against each other.
func refCompute(units, face uint64, rateBps uint32, dc DayCount, days uint32, taxBps uint16, kind Kind, factorBps uint16) (Entitlement, error) {
	u128Max := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 128), big.NewInt(1))
	u64Max := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 64), big.NewInt(1))
	fitsU128 := func(x *big.Int) bool { return x.Cmp(u128Max) <= 0 }
	from64 := func(v uint64) *big.Int { return new(big.Int).SetUint64(v) }

	num := from64(face)
	num.Mul(num, from64(uint64(rateBps)))
	num.Mul(num, from64(uint64(days)))
	if !fitsU128(num) {
		return Entitlement{}, ErrOverflow
	}
	basis, err := dc.Basis()
	if err != nil {
		return Entitlement{}, err
	}
	den := from64(BPS)
	den.Mul(den, from64(uint64(basis)))

	rhu := func(n, d *big.Int) *big.Int {
		q, m := new(big.Int).QuoRem(n, d, new(big.Int))
		if new(big.Int).Lsh(m, 1).Cmp(d) >= 0 {
			q.Add(q, big.NewInt(1))
		}
		return q
	}

	num.Mul(num, from64(units))
	if !fitsU128(num) {
		return Entitlement{}, ErrOverflow
	}
	gross := rhu(num, den)

	taxed := from64(0)
	taxed.Mul(gross, from64(uint64(taxBps)))
	if !fitsU128(taxed) {
		return Entitlement{}, ErrOverflow
	}
	tax := rhu(taxed, big.NewInt(BPS))
	net := new(big.Int).Sub(gross, tax)
	if net.Sign() < 0 {
		return Entitlement{}, ErrOverflow
	}

	full := from64(units)
	full.Mul(full, from64(face))
	var principal *big.Int
	switch kind {
	case KindRedemption, KindEarlyRedemption:
		principal = full
	case KindPartialRedemption:
		p := from64(0)
		p.Mul(full, from64(uint64(factorBps)))
		if !fitsU128(p) {
			return Entitlement{}, ErrOverflow
		}
		principal = rhu(p, big.NewInt(BPS))
	case KindInterest, KindMeeting, KindTermsChange:
		principal = big.NewInt(0)
	default:
		return Entitlement{}, ErrInvalidCode
	}

	to64 := func(x *big.Int) (uint64, error) {
		if x.Sign() < 0 || x.Cmp(u64Max) > 0 {
			return 0, ErrOverflow
		}
		return x.Uint64(), nil
	}
	e := Entitlement{}
	if e.Gross, err = to64(gross); err != nil {
		return Entitlement{}, err
	}
	if e.Tax, err = to64(tax); err != nil {
		return Entitlement{}, err
	}
	if e.Net, err = to64(net); err != nil {
		return Entitlement{}, err
	}
	if e.Principal, err = to64(principal); err != nil {
		return Entitlement{}, err
	}
	return e, nil
}

// FuzzCompute compares the u128-emulation against the big.Int reference,
// including the error sentinels (overflow, unsupported day count, invalid code).
func FuzzCompute(f *testing.F) {
	// All fixture vectors plus the interesting edges.
	f.Add(uint64(10), uint64(100_000), uint32(1000), uint32(180), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(25), uint64(100_000), uint32(1000), uint32(180), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(65), uint64(100_000), uint32(1000), uint32(180), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(10), uint64(100_000), uint32(1000), uint32(180), uint16(0), uint16(0), uint8(1), uint8(0))
	f.Add(uint64(10), uint64(100_000), uint32(1000), uint32(180), uint16(1000), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(7), uint64(100_000), uint32(1595), uint32(180), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(10), uint64(100_000), uint32(1595), uint32(47), uint16(1000), uint16(0), uint8(2), uint8(0))
	f.Add(uint64(3), uint64(1_000_000_000), uint32(1595), uint32(180), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(1), uint64(100_000), uint32(1), uint32(18), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(10), uint64(100_000), uint32(1000), uint32(184), uint16(0), uint16(0), uint8(0), uint8(2))
	f.Add(uint64(10), uint64(100_000), uint32(1200), uint32(180), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(0), uint64(100_000), uint32(1000), uint32(180), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(50_000_000), uint64(100_000), uint32(1595), uint32(180), uint16(0), uint16(0), uint8(1), uint8(0))
	f.Add(uint64(10), uint64(100_000), uint32(1000), uint32(180), uint16(0), uint16(2500), uint8(3), uint8(0))
	f.Add(uint64(10), uint64(100_000), uint32(1000), uint32(180), uint16(65535), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(math.MaxUint64), uint64(math.MaxUint64), uint32(math.MaxUint32), uint32(180), uint16(0), uint16(0), uint8(0), uint8(0))
	f.Add(uint64(math.MaxUint64), uint64(1), uint32(1), uint32(math.MaxUint32), uint16(65535), uint16(65535), uint8(3), uint8(2))
	f.Add(uint64(1), uint64(1), uint32(0), uint32(0), uint16(0), uint16(0), uint8(6), uint8(0)) // invalid kind
	f.Add(uint64(1), uint64(1), uint32(0), uint32(0), uint16(0), uint16(0), uint8(0), uint8(9)) // invalid day count
	f.Add(uint64(1), uint64(1), uint32(0), uint32(0), uint16(0), uint16(0), uint8(0), uint8(1)) // ACT/ACT

	f.Fuzz(func(t *testing.T, units, face uint64, rateBps, days uint32, taxBps, factorBps uint16, kindCode, dcCode uint8) {
		got, err1 := Compute(units, face, rateBps, DayCount(dcCode), days, taxBps, Kind(kindCode), factorBps)
		want, err2 := refCompute(units, face, rateBps, DayCount(dcCode), days, taxBps, Kind(kindCode), factorBps)
		if err1 != err2 {
			t.Fatalf("error mismatch: Compute = %v, reference = %v", err1, err2)
		}
		if err1 == nil && got != want {
			t.Fatalf("value mismatch: Compute = %+v, reference = %+v", got, want)
		}
	})
}
