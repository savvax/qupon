package execconfig

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func TestWriteMergesRegistryIntoBase(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "base.json")
	if err := os.WriteFile(base, []byte(`{"programId":"P","series":{"QPNb1":{"mint":"","isin":"KZ2C0QUPON01"}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "out.json")
	rows := []store.RegistryRow{{Name: "QPN2", Mint: "M2", Terms: json.RawMessage(`{"isin":"KZ2C0QUPON02","faceValue":100000}`)}}
	if err := Write(base, out, rows); err != nil {
		t.Fatal(err)
	}
	var got struct {
		ProgramID string                    `json:"programId"`
		Series    map[string]map[string]any `json:"series"`
	}
	b, _ := os.ReadFile(out)
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if got.ProgramID != "P" || got.Series["QPN2"]["mint"] != "M2" || got.Series["QPN2"]["isin"] != "KZ2C0QUPON02" || got.Series["QPNb1"] == nil {
		t.Fatalf("merged config = %+v", got)
	}
}
