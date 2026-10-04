// Package borsh is a minimal Borsh (https://borsh.io) encoder/decoder layer
// covering exactly the primitives the qupon_bonds accounts use:
// little-endian u8/u16/u32/u64/i64, bool, fixed byte arrays and 32-byte
// pubkeys, plus Anchor account/event discriminators.
package borsh

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// ErrInvalidKind is returned by AnchorDiscriminator for a kind other than
// "account" or "event".
var ErrInvalidKind = errors.New("borsh: invalid discriminator kind")

// Reader decodes Borsh primitives from a byte slice in order.
type Reader struct {
	buf *bytes.Reader
}

// NewReader returns a Reader over data.
func NewReader(data []byte) *Reader {
	return &Reader{buf: bytes.NewReader(data)}
}

// Remaining reports how many bytes are left to read.
func (r *Reader) Remaining() int { return r.buf.Len() }

// Done reports whether every input byte was consumed.
func (r *Reader) Done() bool { return r.buf.Len() == 0 }

func (r *Reader) read(dst any) error {
	if err := binary.Read(r.buf, binary.LittleEndian, dst); err != nil {
		return fmt.Errorf("borsh: %w", err)
	}
	return nil
}

// U8 reads a single unsigned byte.
func (r *Reader) U8() (uint8, error) {
	var v uint8
	err := r.read(&v)
	return v, err
}

// U16 reads a little-endian u16.
func (r *Reader) U16() (uint16, error) {
	var v uint16
	err := r.read(&v)
	return v, err
}

// U32 reads a little-endian u32.
func (r *Reader) U32() (uint32, error) {
	var v uint32
	err := r.read(&v)
	return v, err
}

// U64 reads a little-endian u64.
func (r *Reader) U64() (uint64, error) {
	var v uint64
	err := r.read(&v)
	return v, err
}

// I64 reads a little-endian i64 (Borsh time values).
func (r *Reader) I64() (int64, error) {
	var v int64
	err := r.read(&v)
	return v, err
}

// Bool reads a Borsh bool (0 or 1).
func (r *Reader) Bool() (bool, error) {
	var v bool
	err := r.read(&v)
	return v, err
}

// Bytes reads exactly n bytes.
func (r *Reader) Bytes(n int) ([]byte, error) {
	out := make([]byte, n)
	if _, err := io.ReadFull(r.buf, out); err != nil {
		return nil, fmt.Errorf("borsh: %w", err)
	}
	return out, nil
}

// Pubkey reads a 32-byte public key.
func (r *Reader) Pubkey() ([32]byte, error) {
	var v [32]byte
	err := r.read(&v)
	return v, err
}

// Writer builds a Borsh-encoded byte slice; methods are chainable and never
// fail, so encoders stay one-liners in tests and fixtures.
type Writer struct{ buf bytes.Buffer }

// NewWriter returns an empty Writer.
func NewWriter() *Writer { return &Writer{} }

// Bytes returns the encoded buffer.
func (w *Writer) Bytes() []byte { return w.buf.Bytes() }

// Len returns the encoded length so far.
func (w *Writer) Len() int { return w.buf.Len() }

func (w *Writer) write(v any) *Writer {
	// encoding/binary cannot fail for fixed-size values into a bytes.Buffer.
	if err := binary.Write(&w.buf, binary.LittleEndian, v); err != nil {
		panic(fmt.Sprintf("borsh: writer: %v", err))
	}
	return w
}

// U8 appends a single unsigned byte.
func (w *Writer) U8(v uint8) *Writer { return w.write(v) }

// U16 appends a little-endian u16.
func (w *Writer) U16(v uint16) *Writer { return w.write(v) }

// U32 appends a little-endian u32.
func (w *Writer) U32(v uint32) *Writer { return w.write(v) }

// U64 appends a little-endian u64.
func (w *Writer) U64(v uint64) *Writer { return w.write(v) }

// I64 appends a little-endian i64.
func (w *Writer) I64(v int64) *Writer { return w.write(v) }

// Bool appends a Borsh bool.
func (w *Writer) Bool(v bool) *Writer { return w.write(v) }

// FixedBytes appends a fixed-length byte array ([u8;N]).
func (w *Writer) FixedBytes(v []byte) *Writer { return w.write(v) }

// Pubkey appends a 32-byte public key.
func (w *Writer) Pubkey(v [32]byte) *Writer { return w.write(v) }

// AnchorDiscriminator returns the first 8 bytes of sha256(kind + ":" + name),
// Anchor's discriminator scheme; kind must be "account" or "event".
func AnchorDiscriminator(kind, name string) ([8]byte, error) {
	switch kind {
	case "account", "event":
	default:
		return [8]byte{}, fmt.Errorf("%w: %q", ErrInvalidKind, kind)
	}
	sum := sha256.Sum256([]byte(kind + ":" + name))
	var d [8]byte
	copy(d[:], sum[:8])
	return d, nil
}
