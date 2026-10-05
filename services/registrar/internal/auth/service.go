package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

var (
	ErrBadCredentials  = errors.New("invalid email or password")
	ErrRateLimited     = errors.New("too many sign-in attempts, try again in a minute")
	ErrDemoDisabled    = errors.New("demo sign-in is disabled")
	ErrUnauthenticated = errors.New("not signed in")
)

type Service struct {
	Store     *store.Store
	Now       func() time.Time
	TTL       time.Duration
	DemoLogin bool
	Limit     *Limiter
}

func (s *Service) Login(ctx context.Context, email, password string) (string, store.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	// Only failures count: a stranger cannot lock a real operator out by spamming their email. Unknown emails still
	// pay one bcrypt so the response time does not tell which accounts exist.
	if s.Limit.Blocked(email, s.Now()) {
		return "", store.User{}, ErrRateLimited
	}
	u, hash, err := s.Store.UserByEmail(ctx, email)
	if errors.Is(err, store.ErrNoUser) {
		CheckPassword(dummyHash(), password)
		s.Limit.Hit(email, s.Now())
		return "", store.User{}, ErrBadCredentials
	}
	if err == nil && !CheckPassword(hash, password) {
		s.Limit.Hit(email, s.Now())
		return "", store.User{}, ErrBadCredentials
	}
	if err != nil {
		return "", store.User{}, fmt.Errorf("login: %w", err)
	}
	return s.issue(ctx, u)
}

func (s *Service) Demo(ctx context.Context, role string) (string, store.User, error) {
	if !s.DemoLogin {
		return "", store.User{}, ErrDemoDisabled
	}
	u, err := s.Store.DemoUser(ctx, role)
	if err != nil {
		return "", store.User{}, fmt.Errorf("demo %s: %w", role, err)
	}
	return s.issue(ctx, u)
}

func (s *Service) issue(ctx context.Context, u store.User) (string, store.User, error) {
	raw, hash, err := NewToken()
	if err != nil {
		return "", store.User{}, err
	}
	if err := s.Store.CreateSession(ctx, hash, u.ID, s.Now().Add(s.TTL).Unix()); err != nil {
		return "", store.User{}, fmt.Errorf("create session: %w", err)
	}
	return raw, u, nil
}

func (s *Service) Authenticate(ctx context.Context, token string) (store.User, error) {
	if token == "" {
		return store.User{}, ErrUnauthenticated
	}
	u, err := s.Store.SessionUser(ctx, HashToken(token), s.Now().Unix())
	if errors.Is(err, store.ErrNoSession) {
		return store.User{}, ErrUnauthenticated
	}
	return u, err
}

func (s *Service) Logout(ctx context.Context, token string) error {
	return s.Store.DeleteSession(ctx, HashToken(token))
}
