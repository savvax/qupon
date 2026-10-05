package chain

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"
)

// The API key must reach the RPC server but never appear in an error (errors are logged and sent in 502 bodies).
func TestNewRPCKeepsTheKeyOutOfErrors(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte("rate limited, not json"))
	}))
	defer srv.Close()

	cl := NewRPC(srv.URL+"/?api-key=SECRET-123", 5*time.Second)
	_, err := cl.GetAccountInfo(context.Background(), solana.SystemProgramID)
	if err == nil {
		t.Fatal("expected an error from a non-JSON 429")
	}
	if strings.Contains(err.Error(), "SECRET-123") {
		t.Fatalf("error leaks the key: %v", err)
	}
	if gotQuery != "api-key=SECRET-123" {
		t.Fatalf("server got query %q, want the key on the wire", gotQuery)
	}
}
