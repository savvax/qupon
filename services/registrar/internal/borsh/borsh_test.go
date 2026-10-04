package borsh

import (
	"bytes"
	"errors"
	"io"
	"testing"
)

func TestReaderWriterRoundTrip(t *testing.T) {
	pub := [32]byte{1, 2, 3, 31, 32}
	w := NewWriter().
		U8(0xAB).
		U16(0xCD_EF).
		U32(0x01_02_03_04).
		U64(0x0102_0304_0506_0708).
		I64(-2).
		Bool(true).
		Pubkey(pub).
		FixedBytes([]byte{9, 9, 9})
	data := w.Bytes()
	if len(data) != 1+2+4+8+8+1+32+3 {
		t.Fatalf("encoded length = %d", len(data))
	}

	r := NewReader(data)
	if v, err := r.U8(); err != nil || v != 0xAB {
		t.Fatalf("U8 = %v, %v", v, err)
	}
	if v, err := r.U16(); err != nil || v != 0xCDEF {
		t.Fatalf("U16 = %v, %v", v, err)
	}
	if v, err := r.U32(); err != nil || v != 0x01020304 {
		t.Fatalf("U32 = %v, %v", v, err)
	}
	if v, err := r.U64(); err != nil || v != 0x0102030405060708 {
		t.Fatalf("U64 = %v, %v", v, err)
	}
	if v, err := r.I64(); err != nil || v != -2 {
		t.Fatalf("I64 = %v, %v", v, err)
	}
	if v, err := r.Bool(); err != nil || !v {
		t.Fatalf("Bool = %v, %v", v, err)
	}
	if v, err := r.Pubkey(); err != nil || v != pub {
		t.Fatalf("Pubkey = %v, %v", v, err)
	}
	if v, err := r.Bytes(3); err != nil || !bytes.Equal(v, []byte{9, 9, 9}) {
		t.Fatalf("Bytes = %v, %v", v, err)
	}
	if !r.Done() {
		t.Fatalf("expected reader to be done, %d bytes left", r.Remaining())
	}
}

func TestReaderLittleEndianBytes(t *testing.T) {
	// Borsh is little-endian: u16 0x0102 encodes as 02 01.
	v, err := NewReader([]byte{0x02, 0x01}).U16()
	if err != nil || v != 0x0102 {
		t.Fatalf("U16 = %v, %v", v, err)
	}
	if w := NewWriter().U16(0x0102).Bytes(); !bytes.Equal(w, []byte{0x02, 0x01}) {
		t.Fatalf("U16 wire = %x", w)
	}
}

func TestReaderTruncated(t *testing.T) {
	full := NewWriter().U64(1).U32(2).Pubkey([32]byte{}).Bytes()
	for n := 0; n < len(full); n++ {
		r := NewReader(full[:n])
		var err error
		if _, err = r.U64(); err == nil {
			if _, err = r.U32(); err == nil {
				_, err = r.Pubkey()
			}
		}
		if err == nil {
			t.Fatalf("truncating to %d bytes should fail", n)
		}
		if !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
			t.Fatalf("truncated to %d: error %v is not an EOF", n, err)
		}
	}
}

func TestAnchorDiscriminator(t *testing.T) {
	// Known vector: sha256("account:Counter") = ffb004f5bcfd7c19...
	got, err := AnchorDiscriminator("account", "Counter")
	if err != nil {
		t.Fatal(err)
	}
	want := [8]byte{0xff, 0xb0, 0x04, 0xf5, 0xbc, 0xfd, 0x7c, 0x19}
	if got != want {
		t.Fatalf("account:Counter discriminator = %x, want %x", got, want)
	}
	if _, err := AnchorDiscriminator("bogus", "X"); !errors.Is(err, ErrInvalidKind) {
		t.Fatalf("bogus kind error = %v", err)
	}
}
