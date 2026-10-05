// ISO 20022 export endpoints: seev.031 announcement, seev.036 per-holder
// confirmation (xml / zip of all holders). Handlers fetch accounts via the
// chain client and render with internal/iso20022 (which stays network-free).
package api

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/iso20022"
)

const (
	// isoTimeout bounds one export request (RPC retries included).
	isoTimeout = 45 * time.Second
	// isoCluster labels SplmtryData — the service is devnet-only.
	isoCluster = "devnet"
	// isoUSDCMint mirrors config/devnet.json; any other cash mint is the demo tKZT.
	// ponytail: two demo cash mints; move to config if more currencies appear.
	isoUSDCMint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
	isoTKZT     = "tKZT"
)

// isoRefs assembles the Solana proof fields for an action.
func isoRefs(client *chain.Client, act *chain.CorporateAction, sig string) iso20022.Refs {
	return iso20022.Refs{
		TxSignature: sig,
		Slot:        act.SnapshotSlot,
		ProgramID:   client.ProgramID().String(),
		Cluster:     isoCluster,
	}
}

// cashInfo resolves the settlement currency of an action from its cash mint.
func cashInfo(ctx context.Context, client *chain.Client, act *chain.CorporateAction) (iso20022.Cash, error) {
	ccy := isoTKZT
	if act.CashMint.String() == isoUSDCMint {
		ccy = "USDC"
	}
	mint, err := client.FetchMint(ctx, act.CashMint)
	if err != nil {
		return iso20022.Cash{}, err
	}
	if mint == nil {
		return iso20022.Cash{}, fmt.Errorf("cash mint %s not found", act.CashMint)
	}
	return iso20022.Cash{Ccy: ccy, Decimals: int(mint.Decimals)}, nil
}

// fetchActionSeries loads an action and its series; nil account → 404.
func fetchActionSeries(ctx context.Context, client *chain.Client, pda solana.PublicKey) (*chain.CorporateAction, *chain.Series, error) {
	act, err := client.FetchCorporateAction(ctx, pda)
	if err != nil {
		return nil, nil, err
	}
	if act == nil {
		return nil, nil, nil
	}
	series, err := client.FetchSeries(ctx, act.Series)
	if err != nil {
		return nil, nil, err
	}
	if series == nil {
		return nil, nil, fmt.Errorf("series %s not found", act.Series)
	}
	return act, series, nil
}

// buildHolderSeev036 renders one holder's confirmation; the bond ATA is
// re-derived from owner + bond mint (register_investor derives it the same way).
func buildHolderSeev036(
	ctx context.Context,
	client *chain.Client,
	act *chain.CorporateAction,
	series *chain.Series,
	ent *chain.Entitlement,
	cash iso20022.Cash,
) (*iso20022.Seev036Document, error) {
	ata, _, err := solana.FindAssociatedTokenAddressWithProgram(ent.Owner, series.Mint, solana.Token2022ProgramID)
	if err != nil {
		return nil, fmt.Errorf("derive bond ata: %w", err)
	}
	// The pay_batch signature is not stored on-chain; the explorer link and
	// activity feed carry it. Omitted here rather than faked.
	return iso20022.BuildSeev036(act, series, ent, ata, cash, isoRefs(client, act, ""))
}

func writeXMLError(w http.ResponseWriter, err error) {
	writeError(w, http.StatusBadGateway, err.Error())
}

// isoSeev031 serves GET /actions/{pda}/iso/seev031.xml.
func isoSeev031(client *chain.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid action pda")
			return
		}
		if client == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), isoTimeout)
		defer cancel()
		act, series, err := fetchActionSeries(ctx, client, pda)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		if act == nil {
			writeError(w, http.StatusNotFound, "action account not found")
			return
		}
		doc, err := iso20022.BuildSeev031(act, series, isoRefs(client, act, ""))
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		body, err := iso20022.Marshal(doc)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		_, _ = w.Write(body)
	}
}

// isoSeev036 serves GET /entitlements/{pda}/iso/seev036.xml.
func isoSeev036(client *chain.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid entitlement pda")
			return
		}
		if client == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), isoTimeout)
		defer cancel()
		ent, err := client.FetchEntitlement(ctx, pda)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		if ent == nil {
			writeError(w, http.StatusNotFound, "entitlement account not found")
			return
		}
		act, series, err := fetchActionSeries(ctx, client, ent.Action)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		if act == nil {
			writeError(w, http.StatusNotFound, "action account not found")
			return
		}
		cash, err := cashInfo(ctx, client, act)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		doc, err := buildHolderSeev036(ctx, client, act, series, ent, cash)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		body, err := iso20022.Marshal(doc)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		_, _ = w.Write(body)
	}
}

// isoSeev036Zip serves GET /actions/{pda}/iso/seev036.zip — one confirmation
// per holder, in snapshot order (owner pubkey ascending).
func isoSeev036Zip(client *chain.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid action pda")
			return
		}
		if client == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), isoTimeout)
		defer cancel()
		act, series, err := fetchActionSeries(ctx, client, pda)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		if act == nil {
			writeError(w, http.StatusNotFound, "action account not found")
			return
		}
		ents, err := client.FetchEntitlementsByAction(ctx, pda)
		if err != nil {
			writeXMLError(w, err)
			return
		}
		if len(ents) == 0 {
			writeError(w, http.StatusNotFound, "no entitlements snapshotted for this action")
			return
		}
		cash, err := cashInfo(ctx, client, act)
		if err != nil {
			writeXMLError(w, err)
			return
		}

		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition",
			fmt.Sprintf("attachment; filename=seev036.%s.zip", iso20022.CorpID(act)))
		zw := zip.NewWriter(w)
		for _, rec := range ents {
			doc, err := buildHolderSeev036(ctx, client, act, series, rec.Entitlement, cash)
			if err != nil {
				_ = zw.Close() // header sent; the partial zip is the error surface
				return
			}
			body, err := iso20022.Marshal(doc)
			if err != nil {
				_ = zw.Close()
				return
			}
			fw, err := zw.Create(fmt.Sprintf("seev036.%s.%s.xml", iso20022.CorpID(act), rec.Entitlement.Owner))
			if err != nil {
				_ = zw.Close()
				return
			}
			if _, err := fw.Write(body); err != nil {
				if errors.Is(err, context.Canceled) {
					return
				}
				_ = zw.Close()
				return
			}
		}
		_ = zw.Close()
	}
}
