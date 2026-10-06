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
		owner, _ := f["owner"].(string)
		uid, err := st.WalletOwner(ctx, owner)
		if errors.Is(err, store.ErrNotFound) {
			return nil // the holder has no account here: nothing to notify
		} else if err != nil {
			return err
		}
		payload["net"], payload["principal"], payload["owner"] = f["net"], f["principal"], owner
		return st.Notify(ctx, uid, "entitlement_paid", payload, key("entitlement_paid"))
	}
	return nil
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
