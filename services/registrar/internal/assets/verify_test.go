package assets

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	solana "github.com/solana-foundation/solana-go/v2"
)

const (
	testProgram   = "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd" // qupon_bonds (not a token program)
	testSupply    = uint64(1_000_000)
	testDecimals  = uint8(6)
	pausableExt   = 26 // ExtensionType::Pausable (same layout as chain.DecodeMint)
	pausableLen   = 33
	accountTypeAt = 165
)

func pk(t *testing.T, addr string) solana.PublicKey {
	t.Helper()
	k, err := solana.PublicKeyFromBase58(addr)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

// rpcClient serves one getAccountInfo account (data + owner); nil data = absent.
func rpcClient(t *testing.T, owner string, data []byte) *chain.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var value any
		if data != nil {
			value = map[string]any{
				"data":       []string{base64.StdEncoding.EncodeToString(data), "base64"},
				"executable": false,
				"lamports":   1,
				"owner":      owner,
				"rentEpoch":  0,
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"context": map[string]any{"slot": 1}, "value": value},
		})
	}))
	t.Cleanup(srv.Close)
	return chain.NewClient(srv.URL, pk(t, testProgram), slog.New(slog.DiscardHandler))
}

// splMint encodes the fixed mint layout (82 bytes): COption authorities,
// u64 supply, u8 decimals, initialized flag.
func splMint(mintAuth, freezeAuth *solana.PublicKey) []byte {
	d := make([]byte, 82)
	if mintAuth != nil {
		binary.LittleEndian.PutUint32(d[0:4], 1)
		copy(d[4:36], mintAuth[:])
	}
	binary.LittleEndian.PutUint64(d[36:44], testSupply)
	d[44] = testDecimals
	d[45] = 1
	if freezeAuth != nil {
		binary.LittleEndian.PutUint32(d[46:50], 1)
		copy(d[50:82], freezeAuth[:])
	}
	return d
}

// token2022Mint is splMint padded to 165 with AccountType::Mint and one TLV
// extension (PausableConfig), like a real Token-2022 mint with extensions.
func token2022Mint(mintAuth, freezeAuth *solana.PublicKey) []byte {
	base := splMint(mintAuth, freezeAuth)
	d := make([]byte, accountTypeAt+1+4+pausableLen)
	copy(d, base)
	d[accountTypeAt] = 1 // AccountType::Mint
	binary.LittleEndian.PutUint16(d[accountTypeAt+1:accountTypeAt+3], pausableExt)
	binary.LittleEndian.PutUint16(d[accountTypeAt+3:accountTypeAt+5], pausableLen)
	return d
}

// tokenAccount encodes a 165-byte SPL token account (mint, owner, amount,
// COption delegate, state), the account type VerifyMint must reject.
func tokenAccount(t *testing.T) []byte {
	t.Helper()
	mint := pk(t, testProgram)
	owner := pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
	d := make([]byte, 165)
	copy(d[0:32], mint[:])
	copy(d[32:64], owner[:])
	binary.LittleEndian.PutUint64(d[64:72], 100)
	d[108] = 1 // Account.state: Initialized (delegate COption ends at 108)
	return d
}

func TestVerifyMint(t *testing.T) {
	authority := pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
	mint := pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
	auth := authority.String()

	cases := []struct {
		name        string
		owner       string
		data        []byte
		wantInfo    MintInfo
		wantNotMint bool
		wantUnknown bool
	}{
		{
			name:  "classic spl mint with authorities",
			owner: TokenProgram,
			data:  splMint(&authority, &authority),
			wantInfo: MintInfo{Mint: mint.String(), TokenProgram: TokenProgram, Decimals: testDecimals,
				Supply: "1000000", MintAuthority: &auth, FreezeAuthority: &auth},
		},
		{
			name:     "classic spl mint without authorities",
			owner:    TokenProgram,
			data:     splMint(nil, nil),
			wantInfo: MintInfo{Mint: mint.String(), TokenProgram: TokenProgram, Decimals: testDecimals, Supply: "1000000"},
		},
		{
			// 82 bytes of mint layout but is_initialized = 0: not a usable mint (task 9700)
			name:        "uninitialised mint",
			owner:       TokenProgram,
			data:        func() []byte { d := splMint(nil, nil); d[45] = 0; return d }(),
			wantNotMint: true,
		},
		{
			name:  "token-2022 mint with extensions",
			owner: Token2022Program,
			data:  token2022Mint(&authority, nil),
			wantInfo: MintInfo{Mint: mint.String(), TokenProgram: Token2022Program, Decimals: testDecimals,
				Supply: "1000000", MintAuthority: &auth},
		},
		{
			name:  "token-2022 mint without extensions is 82 bytes",
			owner: Token2022Program,
			data:  splMint(nil, nil),
			wantInfo: MintInfo{Mint: mint.String(), TokenProgram: Token2022Program, Decimals: testDecimals,
				Supply: "1000000"},
		},
		{name: "classic token account", owner: TokenProgram, data: tokenAccount(t), wantNotMint: true},
		{
			name:  "token-2022 token account with extensions",
			owner: Token2022Program,
			data: func() []byte { // AccountType::Account at 165
				d := tokenAccount(t)
				d = append(d, 2, 0, 0)
				d[accountTypeAt] = 2
				return d
			}(),
			wantNotMint: true,
		},
		{name: "account owned by another program", owner: testProgram, data: splMint(nil, nil), wantUnknown: true},
		{name: "absent account", owner: TokenProgram, data: nil, wantNotMint: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			info, err := VerifyMint(t.Context(), rpcClient(t, tc.owner, tc.data), mint)
			switch {
			case tc.wantNotMint:
				if !errors.Is(err, ErrNotMint) {
					t.Fatalf("error = %v, want ErrNotMint", err)
				}
				return
			case tc.wantUnknown:
				if !errors.Is(err, ErrUnknownProgram) {
					t.Fatalf("error = %v, want ErrUnknownProgram", err)
				}
				return
			case err != nil:
				t.Fatalf("VerifyMint: %v", err)
			}
			if info.Mint != tc.wantInfo.Mint || info.TokenProgram != tc.wantInfo.TokenProgram ||
				info.Decimals != tc.wantInfo.Decimals || info.Supply != tc.wantInfo.Supply ||
				!ptrStrEq(info.MintAuthority, tc.wantInfo.MintAuthority) ||
				!ptrStrEq(info.FreezeAuthority, tc.wantInfo.FreezeAuthority) {
				t.Errorf("info:\n got %+v\nwant %+v", info, tc.wantInfo)
			}
		})
	}
}

func ptrStrEq(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}
