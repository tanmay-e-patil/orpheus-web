package apphttp

import (
	"net/http"

	"orpheus-goapp/internal/http/handlers"
)

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := s.Auth.SessionFromRequest(r); err != nil {
			handlers.Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func method(method string, next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method {
			w.Header().Set("Allow", method)
			handlers.Error(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
			return
		}
		next(w, r)
	})
}
