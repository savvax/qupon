package disclosure

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
)

type fakeChain struct {
	action *chain.CorporateAction
}

func (f fakeChain) FetchCorporateAction(context.Context, solana.PublicKey) (*chain.CorporateAction, error) {
	return f.action, nil
}

func (fakeChain) FetchSeries(context.Context, solana.PublicKey) (*chain.Series, error) {
	s := &chain.Series{Mint: solana.PublicKey{2: 2}}
	copy(s.ISIN[:], "KZ2C0QUPON01")
	return s, nil
}

func (fakeChain) ProgramID() solana.PublicKey { return solana.PublicKey{3: 3} }

type fakeExec struct {
	mu      sync.Mutex
	argv    [][]string
	files   []string // file paths passed to --file
	bodies  []string // their contents (Attach deletes the temp files)
	readErr error
	res     executor.Result
	err     error
}

func (f *fakeExec) Run(_ context.Context, args ...string) (executor.Result, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.argv = append(f.argv, args)
	for i, a := range args {
		if a == "--file" && i+1 < len(args) {
			f.files = append(f.files, args[i+1])
			body, err := os.ReadFile(args[i+1]) // Attach deletes the temp file; keep its bytes
			if err != nil {
				f.readErr = err
			} else {
				f.bodies = append(f.bodies, string(body))
			}
		}
	}
	return f.res, f.err
}

func (f *fakeExec) SeriesName(string) (string, error) { return "QPNb1", nil }

func announcedAction() *chain.CorporateAction {
	return &chain.CorporateAction{
		Kind: 0, Status: 0, Series: solana.PublicKey{1: 1}, RateBps: 1000,
		AnnouncedAt: 1_792_096_000, // 2026-07-03 Almaty
	}
}

func TestAttachRunsCLIWithAnchoredBytes(t *testing.T) {
	exec := &fakeExec{res: executor.Result{OK: true, Signature: "sig1"}}
	d := Deps{Chain: fakeChain{action: announcedAction()}, Exec: exec}

	pda := solana.PublicKey{5: 5}
	if err := d.Attach(context.Background(), pda); err != nil {
		t.Fatalf("attach: %v", err)
	}
	if len(exec.argv) != 1 {
		t.Fatalf("argv = %v, want one disclosure:attach run", exec.argv)
	}
	got := exec.argv[0]
	want := []string{"disclosure:attach", "--series", "QPNb1", "--file", got[4]}
	if strings.Join(got, " ") != strings.Join(want, " ") || got[0] != "disclosure:attach" {
		t.Fatalf("argv = %v, want disclosure:attach --series QPNb1 --file …", got)
	}
	if len(exec.files) != 1 {
		t.Fatalf("files = %v", exec.files)
	}
	if exec.readErr != nil || len(exec.bodies) != 1 {
		t.Fatalf("attached file not readable: %v (%d bodies)", exec.readErr, len(exec.bodies))
	}
	body := exec.bodies[0]
	if !strings.Contains(body, "<CorpActnEvtId>") || !strings.Contains(body, "devnet") {
		t.Errorf("attached file is not the anchored seev.031:\n%s", body)
	}
	// The anchored bytes are exactly what Anchored renders (same build twice).
	again, err := Anchored(announcedAction(), mustSeries(t), solana.PublicKey{3: 3}.String())
	if err != nil {
		t.Fatal(err)
	}
	if body != string(again) {
		t.Errorf("attached bytes differ from Anchored() output")
	}
}

func mustSeries(t *testing.T) *chain.Series {
	t.Helper()
	s, err := fakeChain{}.FetchSeries(context.Background(), solana.PublicKey{})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestAttachIdempotent(t *testing.T) {
	// Already anchored on chain → no CLI run at all.
	exec := &fakeExec{res: executor.Result{OK: true}}
	a := announcedAction()
	a.DisclosureHash[0] = 0xab
	d := Deps{Chain: fakeChain{action: a}, Exec: exec}
	if err := d.Attach(context.Background(), solana.PublicKey{5: 5}); err != nil {
		t.Fatalf("attach: %v", err)
	}
	if len(exec.argv) != 0 {
		t.Errorf("argv = %v, want none (hash present)", exec.argv)
	}

	// A racing attach tripped AlreadyAttached on chain → not an error.
	exec2 := &fakeExec{res: executor.Result{OK: false, Error: "custom program error: AlreadyAttached"}}
	d2 := Deps{Chain: fakeChain{action: announcedAction()}, Exec: exec2}
	if err := d2.Attach(context.Background(), solana.PublicKey{5: 5}); err != nil {
		t.Errorf("AlreadyAttached should be a skip, got %v", err)
	}

	// A real refusal surfaces for the caller to log.
	exec3 := &fakeExec{res: executor.Result{OK: false, Error: "WrongStatus"}}
	d3 := Deps{Chain: fakeChain{action: announcedAction()}, Exec: exec3}
	if err := d3.Attach(context.Background(), solana.PublicKey{5: 5}); err == nil {
		t.Error("expected error for a refused attach")
	}
}

func TestAttachNilDepsNoop(t *testing.T) {
	if err := (Deps{}).Attach(context.Background(), solana.PublicKey{5: 5}); err != nil {
		t.Fatalf("empty deps: %v", err)
	}
	exec := &fakeExec{err: errors.New("spawn failed")}
	d := Deps{Chain: fakeChain{action: announcedAction()}, Exec: exec}
	if err := d.Attach(context.Background(), solana.PublicKey{5: 5}); err == nil {
		t.Error("expected spawn error to surface")
	}
}
