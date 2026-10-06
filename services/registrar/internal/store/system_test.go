package store

import (
	"path/filepath"
	"testing"
	"time"
)

func TestKaseStats(t *testing.T) {
	st, err := Open(t.Context(), filepath.Join(t.TempDir(), "kase.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	// empty cache
	ks, err := st.KaseStats(t.Context())
	if err != nil || ks.Entries != 0 || ks.LastFetch != nil || ks.LastError != "" {
		t.Fatalf("empty stats = %+v %v, want zeros", ks, err)
	}

	now := time.Now().Unix()
	seed := []struct {
		key     string
		status  int
		fetched int64
	}{
		{"bonds/TEBNb10/", 200, now - 7200},
		{"bonds/TEBNb10/characteristics/", 500, now - 60},
	}
	for _, r := range seed {
		if _, err := st.db.ExecContext(t.Context(),
			`INSERT INTO kase_cache (key, body, status, fetched_at) VALUES (?, '{}', ?, ?)`,
			r.key, r.status, r.fetched); err != nil {
			t.Fatal(err)
		}
	}

	ks, err = st.KaseStats(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if ks.Entries != 2 || ks.LastFetch == nil || *ks.LastFetch != now-60 {
		t.Errorf("stats = %+v, want 2 entries fetched %d", ks, now-60)
	}
	if ks.LastError != "HTTP 500: bonds/TEBNb10/characteristics/" {
		t.Errorf("lastError = %q, want the recent 500 row", ks.LastError)
	}
}

func TestDemoUsage(t *testing.T) {
	st, err := Open(t.Context(), filepath.Join(t.TempDir(), "demo.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	demoID, err := st.UpsertUser(t.Context(), User{Email: "demo-registrar@qupon.demo", Name: "d", Role: "registrar", IsDemo: true}, "!")
	if err != nil {
		t.Fatal(err)
	}
	realID, err := st.UpsertUser(t.Context(), User{Email: "real@test.kz", Name: "r", Role: "registrar"}, "x")
	if err != nil {
		t.Fatal(err)
	}

	now := time.Now()
	auditRow := func(u int64, route string, ts time.Time, ok bool) {
		t.Helper()
		if err := st.InsertAudit(t.Context(), AuditEntry{Ts: ts.Unix(), UserID: u, Route: route, OK: ok}); err != nil {
			t.Fatal(err)
		}
	}
	auditRow(demoID, "POST /issuer/series", now.Add(-time.Minute), true)               // both counters
	auditRow(demoID, "POST /registrar/actions/x/advance", now.Add(-time.Minute), true) // writes only
	auditRow(demoID, "POST /issuer/series", now.Add(-2*time.Hour), true)               // outside the hour window, inside the day
	auditRow(demoID, "POST /issuer/series", now.Add(-25*time.Hour), true)              // outside both windows
	auditRow(demoID, "POST /issuer/series", now.Add(-time.Minute), false)              // failed: not counted
	auditRow(realID, "POST /issuer/series", now.Add(-time.Minute), true)               // real user: not counted

	usage, err := st.DemoUsage(t.Context(), now)
	if err != nil {
		t.Fatal(err)
	}
	if usage.WritesPerHour != 2 {
		t.Errorf("writesPerHour = %d, want 2", usage.WritesPerHour)
	}
	if usage.SeriesPerDay != 2 {
		t.Errorf("seriesPerDay = %d, want 2", usage.SeriesPerDay)
	}
}
