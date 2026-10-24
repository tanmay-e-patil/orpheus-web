//go:build integration

package store_test

import (
	"crypto/sha256"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"orpheus-web/internal/testutil"
)

func TestNativeLoginGrantSingleUse(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	if _, err := db.CreateUser(t.Context(), "native-user", "Native User", "native@example.com", "native-user"); err != nil {
		t.Fatal(err)
	}
	code := sha256.Sum256([]byte("code"))
	request := sha256.Sum256([]byte("request"))
	if err := db.CreateNativeLoginGrant(t.Context(), code[:], request[:], "challenge", "native-user", time.Now().Add(time.Minute), time.Now().Add(5*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ConsumeNativeLoginGrant(t.Context(), code[:], "wrong"); err == nil {
		t.Fatal("wrong verifier accepted")
	}
	var success atomic.Int32
	var wg sync.WaitGroup
	for range 10 {
		wg.Go(func() {
			if user, err := db.ConsumeNativeLoginGrant(t.Context(), code[:], "challenge"); err == nil && user == "native-user" {
				success.Add(1)
			}
		})
	}
	wg.Wait()
	if success.Load() != 1 {
		t.Fatalf("successful exchanges = %d", success.Load())
	}
	if err := db.CreateNativeLoginGrant(t.Context(), code[:], request[:], "challenge", "native-user", time.Now().Add(time.Minute), time.Now().Add(5*time.Minute)); err == nil {
		t.Fatal("authorized request replay accepted")
	}
	expired := sha256.Sum256([]byte("expired"))
	expiredRequest := sha256.Sum256([]byte("expired-request"))
	if err := db.CreateNativeLoginGrant(t.Context(), expired[:], expiredRequest[:], "challenge", "native-user", time.Now().Add(-time.Second), time.Now().Add(4*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ConsumeNativeLoginGrant(t.Context(), expired[:], "challenge"); err == nil {
		t.Fatal("expired code accepted")
	}
}
