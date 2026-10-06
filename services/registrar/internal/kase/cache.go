package kase

import (
	"context"
	"time"
)

// CacheStore is the persistence behind the kase cache (implemented by *store.Store,
// migration 006 table kase_cache).
type CacheStore interface {
	GetKaseCache(ctx context.Context, key string) (body string, fetchedAt int64, ok bool, err error)
	PutKaseCache(ctx context.Context, key, body string, fetchedAt int64) error
}

// Cache TTLs per spec §5.5.
const (
	TTLReference = time.Hour       // characteristics, coupon schedule
	TTLMarket    = 5 * time.Minute // bond snapshot (quotes), trade info, last deals
	TTLNews      = 30 * time.Minute
)

// Service composes the client, the cache and the normalisers. One instance per
// process: it shares the client's global request pacing.
type Service struct {
	Client *Client
	Store  CacheStore       // nil = no persistence: always fetch, never serve stale
	Now    func() time.Time // injectable clock (tests); nil = time.Now
}

// NewService returns the production service backed by st (SQLite).
func NewService(st CacheStore) *Service {
	return &Service{Client: NewClient(), Store: st, Now: time.Now}
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// cached returns the body for key: the cached copy while younger than ttl,
// otherwise a fresh fetch. When kase.kz fails but a previous good body exists,
// it is served with stale = true (spec §5.5 risk: kase.kz may block or change).
func (s *Service) cached(ctx context.Context, key string, ttl time.Duration, fetch func(context.Context) ([]byte, error)) (body []byte, fetchedAt time.Time, stale bool, err error) {
	if s.Store != nil {
		if b, at, ok, gerr := s.Store.GetKaseCache(ctx, key); gerr == nil && ok && s.now().Sub(time.Unix(at, 0)) < ttl {
			return []byte(b), time.Unix(at, 0), false, nil
		}
	}
	body, err = fetch(ctx)
	if err != nil {
		if s.Store != nil {
			if b, at, ok, gerr := s.Store.GetKaseCache(ctx, key); gerr == nil && ok {
				return []byte(b), time.Unix(at, 0), true, nil
			}
		}
		return nil, time.Time{}, false, err
	}
	if s.Store != nil {
		if perr := s.Store.PutKaseCache(ctx, key, string(body), s.now().Unix()); perr != nil {
			_ = perr // best effort: a failed cache write only costs a refetch
		}
	}
	return body, s.now(), false, nil
}

// optional fetches enrich the DTO but never fail the request: a broken endpoint
// degrades the response (and marks it stale when the cached copy is served).
type optBody struct {
	body  []byte
	stale bool
}

func (s *Service) optional(ctx context.Context, key string, ttl time.Duration, fetch func(context.Context) ([]byte, error)) optBody {
	body, _, stale, err := s.cached(ctx, key, ttl, fetch)
	if err != nil {
		return optBody{}
	}
	return optBody{body: body, stale: stale}
}

// Bond returns the normalised kase.kz bond for a ticker. The bond snapshot is
// required (404 → ErrNotFound, failure without cache → ErrUnavailable); the
// enrichment endpoints degrade.
func (s *Service) Bond(ctx context.Context, ticker string) (Bond, error) {
	if !ValidCode(ticker) {
		return Bond{}, ErrInvalidCode
	}
	c := s.client()
	bondBody, fetchedAt, stale, err := s.cached(ctx, "bond:"+ticker, TTLMarket,
		func(ctx context.Context) ([]byte, error) { return c.Bond(ctx, ticker) })
	if err != nil {
		return Bond{}, err
	}
	parts := []optBody{
		s.optional(ctx, "characteristics:"+ticker, TTLReference,
			func(ctx context.Context) ([]byte, error) { return c.Characteristics(ctx, ticker) }),
		s.optional(ctx, "coupons:"+ticker, TTLReference,
			func(ctx context.Context) ([]byte, error) { return c.Coupons(ctx, ticker) }),
		s.optional(ctx, "trade-info:"+ticker, TTLMarket,
			func(ctx context.Context) ([]byte, error) { return c.TradeInfo(ctx, ticker) }),
		s.optional(ctx, "last-deals:"+ticker, TTLMarket,
			func(ctx context.Context) ([]byte, error) { return c.LastDeals(ctx, ticker) }),
	}
	for _, p := range parts {
		stale = stale || p.stale
	}
	out, err := NormalizeBond(bondBody, parts[0].body, parts[1].body, parts[2].body, parts[3].body)
	if err != nil {
		return Bond{}, err
	}
	out.Stale = stale
	out.FetchedAt = fetchedAt.Format(time.RFC3339)
	return out, nil
}

// News returns the issuer's kase.kz news feed (lang: "ru" or "en").
func (s *Service) News(ctx context.Context, issuer, lang string) (News, error) {
	if !ValidCode(issuer) {
		return News{}, ErrInvalidCode
	}
	if lang == "" {
		lang = "ru"
	}
	c := s.client()
	body, fetchedAt, stale, err := s.cached(ctx, "news:"+issuer+":"+lang, TTLNews,
		func(ctx context.Context) ([]byte, error) { return c.News(ctx, issuer, lang) })
	if err != nil {
		return News{}, err
	}
	out, err := NormalizeNews(issuer, lang, body)
	if err != nil {
		return News{}, err
	}
	out.Stale = stale
	out.FetchedAt = fetchedAt.Format(time.RFC3339)
	return out, nil
}

func (s *Service) client() *Client {
	if s.Client != nil {
		return s.Client
	}
	return NewClient()
}
