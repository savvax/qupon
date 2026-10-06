package api

import (
	"net/http"
	"testing"
)

func TestNotificationRoutes(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	tok := signIn(t, h, st, svc, "investor")
	u, _, err := st.UserByEmail(t.Context(), "investor@test.kz")
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"a", "b"} {
		if err := st.Notify(t.Context(), u.ID, "kyc_decision", map[string]any{"status": "approved"}, key); err != nil {
			t.Fatal(err)
		}
	}
	if c := doGet(t, h, "/me/notifications/count", ""); c != http.StatusUnauthorized {
		t.Fatalf("anonymous count = %d, want 401", c)
	}
	code, out := doJSONReq(t, h, http.MethodGet, "/me/notifications/count", "", tok)
	if code != http.StatusOK || out["unread"] != float64(2) {
		t.Fatalf("count = %d %v", code, out)
	}
	if c, _ := doPost(t, h, "/me/notifications/read", `{}`, tok); c != http.StatusBadRequest {
		t.Fatalf("empty read = %d, want 400", c)
	}
	if c, out := doPost(t, h, "/me/notifications/read", `{"all":true}`, tok); c != http.StatusOK || out["marked"] != float64(2) {
		t.Fatalf("read all = %d %v", c, out)
	}
	code, out = doJSONReq(t, h, http.MethodGet, "/me/notifications?unread=1", "", tok)
	if list, _ := out["notifications"].([]any); code != http.StatusOK || len(list) != 0 {
		t.Fatalf("unread list = %d %v", code, out)
	}
}
