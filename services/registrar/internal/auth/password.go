package auth

import (
	"sync"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

// dummyHash is compared against for unknown emails (same cost as a real check).
var dummyHash = sync.OnceValue(func() string {
	h, _ := HashPassword("not a real password")
	return h
})

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcryptCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}
