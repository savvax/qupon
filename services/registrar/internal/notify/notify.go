// Package notify fans ingested on-chain events out to in-app notifications (platform v2 §5.4, task 805).
package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// kindNames mirrors the program's ActionKind enum (api.kindNames, iso20022.kindCodes).
var kindNames = []string{"INTR", "REDM", "MCAL", "PCAL", "BMET", "CHAN"}

const kindMeeting = 4

// FromEvent writes the notifications one stored event implies. Idempotent: the dedup key is the notification kind
// plus the event's signature and position, per user, so replaying a transaction adds nothing. KYC decisions notify
// from the KYC handler (kind kyc_decision); invite_accepted belongs to the organisation flow.
func FromEvent(ctx context.Context, st *store.Store, a store.Activity) error {
	var f map[string]any
	if err := json.Unmarshal(a.Payload, &f); err != nil {
		return fmt.Errorf("notify %s: %w", a.Kind, err)
	}
	payload := map[string]any{"series": deref(a.SeriesMint), "action": deref(a.ActionPDA), "sig": a.Sig}
	key := func(kind string) string { return fmt.Sprintf("%s:%s:%d", kind, a.Sig, a.Seq) }
	switch a.Kind {
	case "ActionAnnounced":
		kind := "action_announced"
		if k, ok := f["kind"].(float64); ok && int(k) >= 0 && int(k) < len(kindNames) {
			payload["actionKind"] = kindNames[int(k)]
			if int(k) == kindMeeting {
				kind = "meeting_opened"
			}
		}
		return toHolders(ctx, st, deref(a.SeriesMint), kind, payload, key(kind))
	case "MeetingFinalized":
		payload["result"] = f["result"]
		return toHolders(ctx, st, deref(a.SeriesMint), "meeting_finalized", payload, key("meeting_finalized"))
	case "EntitlementPaid":
		payload["net"], payload["principal"] = f["net"], f["principal"]
		return toOwner(ctx, st, f, payload, "entitlement_paid", key("entitlement_paid"))
	// Plan 15 D4: the record-date holders learn about a default and its cure.
	case "ActionDefaulted":
		payload["shortfall"], payload["required"] = f["shortfall"], f["required"]
		return toHolders(ctx, st, deref(a.SeriesMint), "action_defaulted", payload, key("action_defaulted"))
	case "DefaultCured":
		payload["lateSecs"] = f["late_secs"]
		return toHolders(ctx, st, deref(a.SeriesMint), "default_cured", payload, key("default_cured"))
	// Plan 15 D6: bank-routed payouts (the bank transfer itself is SIMULATED).
	case "PaidToAgent":
		payload["amount"] = f["amount"]
		return toOwner(ctx, st, f, payload, "paid_to_bank_agent", key("paid_to_bank_agent"))
	case "BankPayoutConfirmed":
		payload["referenceHash"] = f["reference_hash"]
		return toOwner(ctx, st, f, payload, "bank_payout_confirmed", key("bank_payout_confirmed"))
	}
	return nil
}

// toOwner notifies the account linked to the event's `owner` wallet, if any.
func toOwner(ctx context.Context, st *store.Store, f, payload map[string]any, kind, dedup string) error {
	owner, _ := f["owner"].(string)
	uid, err := st.WalletOwner(ctx, owner)
	if errors.Is(err, store.ErrNotFound) {
		return nil // the holder has no account here: nothing to notify
	} else if err != nil {
		return err
	}
	payload["owner"] = owner
	return st.Notify(ctx, uid, kind, payload, dedup)
}

func toHolders(ctx context.Context, st *store.Store, series, kind string, payload map[string]any, dedup string) error {
	if series == "" {
		return nil
	}
	users, err := st.SeriesHolderUsers(ctx, series)
	if err != nil {
		return err
	}
	for _, u := range users {
		if err := st.Notify(ctx, u, kind, payload, dedup); err != nil {
			return err
		}
	}
	return nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
