package chain

import (
	"encoding/binary"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"
)

func TestParseUpgradeableLoaderState(t *testing.T) {
	pd := solana.NewWallet().PublicKey()
	prog := make([]byte, 36)
	binary.LittleEndian.PutUint32(prog, 2)
	copy(prog[4:], pd[:])
	if got, err := parseProgramAccount(prog); err != nil || !got.Equals(pd) {
		t.Fatalf("program account = %s %v", got, err)
	}
	if _, err := parseProgramAccount(prog[:20]); err == nil {
		t.Fatal("short account accepted")
	}

	auth := solana.NewWallet().PublicKey()
	data := make([]byte, 45+8)
	binary.LittleEndian.PutUint32(data, 3)
	data[12] = 1
	copy(data[13:], auth[:])
	if a, err := parseProgramData(data); err != nil || a == nil || *a != auth.String() {
		t.Fatalf("authority = %v %v", a, err)
	}
	data[12] = 0 // immutable program
	if a, err := parseProgramData(data); err != nil || a != nil {
		t.Fatalf("immutable = %v %v", a, err)
	}
	binary.LittleEndian.PutUint32(data, 2)
	if _, err := parseProgramData(data); err == nil {
		t.Fatal("wrong tag accepted")
	}
}
