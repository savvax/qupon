package chain

import (
	"net/http"
	"net/url"
	"time"

	"github.com/solana-foundation/solana-go/v2/rpc"
	"github.com/solana-foundation/solana-go/v2/rpc/jsonrpc"
)

// NewRPC returns a solana-go client whose URL carries no query string. solana-go prints the request URL in its
// errors, and those errors reach logs and 502 bodies — a keyed endpoint (`?api-key=…`) would leak its key. The
// query is appended on the wire by keyQueryTransport instead. timeout 0 = no client timeout.
func NewRPC(rawURL string, timeout time.Duration) *rpc.Client {
	u, err := url.Parse(rawURL)
	if err != nil || u.RawQuery == "" {
		if timeout == 0 {
			return rpc.New(rawURL)
		}
		return rpc.NewWithTimeout(rawURL, timeout)
	}
	query := u.RawQuery
	u.RawQuery = ""
	hc := &http.Client{Timeout: timeout, Transport: keyQueryTransport{query: query, base: http.DefaultTransport}}
	return rpc.NewWithCustomRPCClient(jsonrpc.NewClientWithOpts(u.String(), &jsonrpc.RPCClientOpts{HTTPClient: hc}))
}

type keyQueryTransport struct {
	query string
	base  http.RoundTripper
}

func (t keyQueryTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r2 := r.Clone(r.Context()) // a RoundTripper must not modify the caller's request
	if r2.URL.RawQuery == "" {
		r2.URL.RawQuery = t.query
	} else {
		r2.URL.RawQuery += "&" + t.query
	}
	return t.base.RoundTrip(r2)
}
