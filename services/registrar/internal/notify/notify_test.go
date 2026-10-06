package notify

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

const series = "SeriesPDA1111111111111111111111111111111111"

func open(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "notify.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}

// investor creates a user with one linked wallet through the real challenge → link path.
func investor(t *testing.T, st *store.Store, email, wallet string) int64 {
	t.Helper()
	ctx := t.Context()
	id, err := st.UpsertUser(ctx, store.User{Email: email, Name: email, Role: "investor"}, "x")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().Unix()
	nonce := "n-" + email
	if err := st.CreateWalletChallenge(ctx, store.WalletChallenge{Nonce: nonce, UserID: id, Address: wallet, ExpiresAt: now + 600}); err != nil {
		t.Fatal(err)
	}
	if err := st.LinkWallet(ctx, nonce, store.Wallet{Address: wallet, UserID: id, VerifiedAt: now}); err != nil {
		t.Fatal(err)
	}
	return id
}

// event stores an activity row the way ingest does and runs the fan-out on it.
func event(t *testing.T, st *store.Store, kind, sig string, seq int, fields map[string]any) {
	t.Helper()
	p, _ := json.Marshal(fields)
	s, a := series, "ActionPDA"
	row := store.Activity{Ts: time.Now().Unix(), Kind: kind, Sig: sig, Seq: seq, SeriesMint: &s, ActionPDA: &a, Payload: p}
	if _, err := st.InsertActivity(t.Context(), row); err != nil {
		t.Fatal(err)
	}
	if err := FromEvent(t.Context(), st, row); err != nil {
		t.Fatal(err)
	}
}

func count(t *testing.T, st *store.Store, uid int64) int {
	t.Helper()
	n, err := st.UnreadNotifications(context.Background(), uid)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func TestFanOut(t *testing.T) {
	st := open(t)
	holder := investor(t, st, "holder@test.kz", "HolderWallet111")
	outsider := investor(t, st, "outsider@test.kz", "OutsiderWallet11")
	event(t, st, "InvestorRegistered", "sig-reg", 0, map[string]any{"series": series, "owner": "HolderWallet111"})

	// coupon announced → holders only; replaying the same event adds nothing
	announce := map[string]any{"series": series, "kind": 0}
	event(t, st, "ActionAnnounced", "sig-ann", 0, announce)
	event(t, st, "ActionAnnounced", "sig-ann", 0, announce)
	if got := count(t, st, holder); got != 1 {
		t.Fatalf("holder unread = %d, want 1", got)
	}
	if got := count(t, st, outsider); got != 0 {
		t.Fatalf("non-holder unread = %d, want 0", got)
	}

	// a meeting announcement is "meeting_opened"; payment notifies only the paid owner
	event(t, st, "ActionAnnounced", "sig-meet", 0, map[string]any{"series": series, "kind": 4})
	event(t, st, "EntitlementPaid", "sig-pay", 2, map[string]any{"series": series, "owner": "HolderWallet111", "net": "450000"})
	event(t, st, "EntitlementPaid", "sig-pay", 3, map[string]any{"series": series, "owner": "NobodyWallet1111", "net": "1"})
	list, err := st.ListNotifications(t.Context(), holder, false, 10)
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]bool{}
	for _, n := range list {
		kinds[n.Kind] = true
	}
	for _, k := range []string{"action_announced", "meeting_opened", "entitlement_paid"} {
		if !kinds[k] {
			t.Fatalf("holder notifications %v miss %s", kinds, k)
		}
	}
	if got := count(t, st, outsider); got != 0 {
		t.Fatalf("non-holder unread = %d after more events, want 0", got)
	}

	// read: by id, then all; another user's ids are ignored
	if n, _ := st.MarkNotificationsRead(t.Context(), outsider, []int64{list[0].ID}, false); n != 0 {
		t.Fatalf("outsider marked %d of the holder's rows", n)
	}
	if n, _ := st.MarkNotificationsRead(t.Context(), holder, []int64{list[0].ID}, false); n != 1 {
		t.Fatalf("marked %d, want 1", n)
	}
	if _, err := st.MarkNotificationsRead(t.Context(), holder, nil, true); err != nil || count(t, st, holder) != 0 {
		t.Fatalf("mark all: %v, unread %d", err, count(t, st, holder))
	}
}
