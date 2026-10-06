package api

import (
	"net/http"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// The onboarding checklist route (task 808) reuses the faucet test environment: its base config
// carries the testAssets (KZTE-dev, dKZT and the spl-kind REAL) and the fake CLI lets a real
// POST /me/faucet close the loop into the audit trail.

// seedRegistry adds enabled registry assets: the two test assets plus USDC — a stablecoin that is
// NOT in testAssets and must therefore never grow a faucet button.
func seedRegistry(t *testing.T, st *store.Store) {
	t.Helper()
	for _, a := range []store.CashAsset{
		{Network: "devnet", Mint: fKzte, Symbol: "KZTE-dev", Name: "Evo tenge (devnet stand-in)", Decimals: 2, Kind: "stablecoin", Enabled: true},
		{Network: "devnet", Mint: fDkzt, Symbol: "dKZT", Name: "Digital tenge (SIMULATED)", Decimals: 2, Kind: "wrapped_cbdc", Enabled: true},
		{Network: "devnet", Mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", Symbol: "USDC", Name: "USD Coin", Decimals: 6, Kind: "stablecoin", Enabled: true},
	} {
		if err := st.UpsertCashAsset(t.Context(), a); err != nil {
			t.Fatal(err)
		}
	}
}

func TestOnboardingRequiresSignIn(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	if code, _ := e.call("GET", "/me/onboarding", "", ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", code)
	}
}

func TestOnboardingFreshUser(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	seedRegistry(t, e.st)
	tok, _ := e.userWithWallet("fresh@q.kz")

	code, body := e.call("GET", "/me/onboarding", "", tok)
	if code != 200 {
		t.Fatalf("get: %d %v", code, body)
	}
	cl := body["checklist"].(map[string]any)
	for k, want := range map[string]bool{
		"account": true, "walletLinked": true, "kycApproved": false, "testCashReceived": false, "subscribed": false,
	} {
		if cl[k] != want {
			t.Fatalf("checklist[%s] = %v, want %v", k, cl[k], want)
		}
	}
	// faucetAssets = testAssets ∩ enabled registry: KZTE-dev and dKZT, never USDC (not a test
	// asset) or REAL (kind spl).
	assets := body["faucetAssets"].([]any)
	if len(assets) != 2 {
		t.Fatalf("faucetAssets = %v, want 2", assets)
	}
	for i, sym := range []string{"KZTE-dev", "dKZT"} {
		a := assets[i].(map[string]any)
		if a["symbol"] != sym || a["mint"] == "" || a["decimals"].(float64) != 2 {
			t.Fatalf("asset %d = %v, want %s with decimals 2", i, a, sym)
		}
	}
}

func TestOnboardingChecklistProgress(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	seedRegistry(t, e.st)
	tok, addr := e.userWithWallet("pro@q.kz")

	// a real faucet write through task 603's route → the audit trail answers testCashReceived
	if code, body := e.call("POST", "/me/faucet", `{"mint":"`+fKzte+`"}`, tok); code != 200 {
		t.Fatalf("faucet: %d %v", code, body)
	}
	// a Subscribed event of that wallet → subscribed
	if _, err := e.st.InsertActivity(t.Context(), store.Activity{
		Kind: "Subscribed", Payload: []byte(`{"series":"Sp1","owner":"` + addr + `","units":"2"}`),
	}); err != nil {
		t.Fatal(err)
	}
	// an approved KYC application → kycApproved
	app, err := e.st.CreateKyc(t.Context(), store.KycApplication{
		UserID: 1, Wallet: addr, InvestorType: "individual", Residency: "resident",
		FullName: "Pro Gress", Status: "submitted",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := e.st.DecideKyc(t.Context(), app.ID, "approved", "", nil, 1, 1); err != nil {
		t.Fatal(err)
	}

	code, body := e.call("GET", "/me/onboarding", "", tok)
	if code != 200 {
		t.Fatalf("get: %d %v", code, body)
	}
	cl := body["checklist"].(map[string]any)
	for _, k := range []string{"account", "walletLinked", "kycApproved", "testCashReceived", "subscribed"} {
		if cl[k] != true {
			t.Fatalf("checklist[%s] = %v, want true (all done)", k, cl[k])
		}
	}
}

func TestOnboardingMainnetHasNoFaucetAssets(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "mainnet-beta", Mainnet: true})
	seedRegistry(t, e.st)
	tok, _ := e.userWithWallet("mn@q.kz")

	code, body := e.call("GET", "/me/onboarding", "", tok)
	if code != 200 {
		t.Fatalf("get: %d %v", code, body)
	}
	if n := len(body["faucetAssets"].([]any)); n != 0 {
		t.Fatalf("mainnet faucetAssets = %d, want 0", n)
	}
}
