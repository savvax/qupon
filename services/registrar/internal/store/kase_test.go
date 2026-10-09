package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestKaseCacheRoundtrip(t *testing.T) {
	ctx := context.Background()
	st, err := Open(ctx, filepath.Join(t.TempDir(), "kase-cache.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer func() { _ = st.Close() }()

	// miss: ok=false, no error
	if body, at, ok, err := st.GetKaseCache(ctx, "bond:TEBNb10"); ok || err != nil || body != "" || at != 0 {
		t.Fatalf("miss = %q %d %v %v, want empty false nil", body, at, ok, err)
	}

	at := time.Unix(1760000000, 0).Unix()
	if err := st.PutKaseCache(ctx, "bond:TEBNb10", `{"code":"TEBNb10"}`, at); err != nil {
		t.Fatalf("put: %v", err)
	}
	if body, got, ok, err := st.GetKaseCache(ctx, "bond:TEBNb10"); !ok || err != nil || body != `{"code":"TEBNb10"}` || got != at {
		t.Fatalf("hit = %q %d %v %v", body, got, ok, err)
	}

	// an upsert replaces the body and the timestamp (last good body wins)
	if err := st.PutKaseCache(ctx, "bond:TEBNb10", `{"code":"v2"}`, at+60); err != nil {
		t.Fatalf("re-put: %v", err)
	}
	if body, got, _, _ := st.GetKaseCache(ctx, "bond:TEBNb10"); body != `{"code":"v2"}` || got != at+60 {
		t.Fatalf("after re-put = %q %d, want v2 %d", body, got, at+60)
	}

	// keys are independent
	if err := st.PutKaseCache(ctx, "news:ASBN:ru", `{}`, at); err != nil {
		t.Fatalf("put second key: %v", err)
	}
	if _, _, ok, _ := st.GetKaseCache(ctx, "news:ASBN:ru"); !ok {
		t.Fatal("second key missing")
	}
}

// Review focus: the cache is never bounded — keys are walkable codes, so every
// put evicts rows older than 7 days (task 1416).
func TestKaseCacheEviction(t *testing.T) {
	ctx := context.Background()
	st, err := Open(ctx, filepath.Join(t.TempDir(), "kase-cache-evict.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer func() { _ = st.Close() }()

	week := int64((7 * 24 * time.Hour).Seconds())
	at := time.Unix(1760000000, 0).Unix()
	old := at - week - 1
	if err := st.PutKaseCache(ctx, "bond:OLDb1", `{}`, old); err != nil {
		t.Fatalf("put old: %v", err)
	}
	if err := st.PutKaseCache(ctx, "bond:TEBNb10", `{}`, at); err != nil {
		t.Fatalf("put fresh: %v", err)
	}
	if _, _, ok, _ := st.GetKaseCache(ctx, "bond:OLDb1"); ok {
		t.Error("row older than 7 days survived a put")
	}
	if _, _, ok, _ := st.GetKaseCache(ctx, "bond:TEBNb10"); !ok {
		t.Error("fresh row was evicted")
	}
}
