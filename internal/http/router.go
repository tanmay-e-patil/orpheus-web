package apphttp

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"orpheus-web/internal/config"
	"orpheus-web/internal/http/handlers"
	"orpheus-web/internal/services"
	"orpheus-web/internal/store"
)

type Server struct {
	Config  config.Config
	Store   *store.Store
	Auth    *AuthService
	Passkey *PasskeyService
	YouTube *services.YouTubeClient
	Deezer  *services.DeezerClient
	LRCLib  *services.LRCLibClient
	WebDir  string
}

func NewServer(cfg config.Config, db *store.Store, youtube *services.YouTubeClient, deezer *services.DeezerClient, lrclib *services.LRCLibClient, webDir string) *Server {
	auth := NewAuthService(cfg, db)
	passkey, err := NewPasskeyService(cfg, db)
	if err != nil {
		// Passkey service requires valid WebAuthn config; log and continue
		// Registration/login endpoints will return errors if used without valid config
		passkey = nil
	}
	return &Server{
		Config:  cfg,
		Store:   db,
		Auth:    auth,
		Passkey: passkey,
		YouTube: youtube,
		Deezer:  deezer,
		LRCLib:  lrclib,
		WebDir:  webDir,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.Handle("GET /healthz", method(http.MethodGet, handlers.Health))
	mux.Handle("GET /metrics", promhttp.Handler())

	// Auth — public
	mux.Handle("POST /api/auth/register", method(http.MethodPost, handlers.Register(s.Auth)))
	mux.Handle("POST /api/auth/login", method(http.MethodPost, handlers.Login(s.Auth)))
	mux.Handle("POST /api/auth/logout", method(http.MethodPost, handlers.Logout(s.Auth)))
	mux.Handle("GET /api/auth/session", method(http.MethodGet, handlers.Session(s.Auth)))

	// Native browser authentication: fixed callback, PKCE, one-use database grants.
	native := newNativeAuth(s.Config, s.Auth, s.Store)
	mux.HandleFunc("POST /api/auth/native/begin", native.begin)
	mux.HandleFunc("GET /api/auth/native/details", native.details)
	mux.HandleFunc("POST /api/auth/native/authorize", native.authorize)
	mux.HandleFunc("POST /api/auth/native/exchange", native.exchange)

	// Passkey — public (login ceremony)
	mux.Handle("POST /api/auth/passkey/login-begin", method(http.MethodPost, handlers.PasskeyLoginBegin(s.Passkey)))
	mux.Handle("POST /api/auth/passkey/login-finish", method(http.MethodPost, handlers.PasskeyLoginFinish(s.Auth, s.Passkey, s.Store)))

	// Passkey — authenticated (registration ceremony)
	mux.Handle("GET /api/auth/passkey/status", s.requireAuth(method(http.MethodGet, handlers.PasskeyStatus(s.Auth))))
	mux.Handle("POST /api/auth/passkey/register-begin", s.requireAuth(method(http.MethodPost, handlers.PasskeyRegisterBegin(s.Auth, s.Passkey))))
	mux.Handle("POST /api/auth/passkey/register-finish", s.requireAuth(method(http.MethodPost, handlers.PasskeyRegisterFinish(s.Auth, s.Passkey))))
	mux.Handle("GET /api/auth/passkeys", s.requireAuth(method(http.MethodGet, handlers.PasskeyList(s.Auth, s.Store))))
	mux.Handle("DELETE /api/auth/passkeys/{id}", s.requireAuth(method(http.MethodDelete, handlers.PasskeyDelete(s.Auth, s.Store))))

	// Protected API routes
	mux.Handle("GET /api/songs", s.requireAuth(method(http.MethodGet, handlers.GetSongs(s.Store, UserIDFromContext))))
	mux.Handle("DELETE /api/songs/{trackId}", s.requireAuth(method(http.MethodDelete, handlers.DeleteSong(s.Store))))
	mux.Handle("GET /api/songs/{trackId}", s.requireAuth(method(http.MethodGet, handlers.GetSong(s.Store, UserIDFromContext))))
	mux.Handle("GET /api/songs/{trackId}/audio", s.requireAuth(method(http.MethodGet, handlers.StreamSongAudio(s.Store, s.Config.MusicLibraryPath))))
	mux.Handle("POST /api/songs/{trackId}/plays", s.requireAuth(method(http.MethodPost, handlers.RecordSongPlay(s.Store, UserIDFromContext))))
	mux.Handle("PATCH /api/songs/{trackId}/metadata", s.requireAuth(method(http.MethodPatch, handlers.UpdateSongMetadata(s.Store, UserIDFromContext))))
	mux.Handle("POST /api/songs/{trackId}/audio-source", s.requireAuth(method(http.MethodPost, handlers.ReplaceAudioSource(s.Store, UserIDFromContext))))
	mux.Handle("POST /api/songs/{trackId}/regenerate", s.requireAuth(method(http.MethodPost, handlers.RegenerateSong(s.Store, UserIDFromContext))))
	mux.Handle("POST /api/songs/album-art/refresh", s.requireAuth(method(http.MethodPost, handlers.RefreshAlbumArt(s.Store, s.Deezer))))
	mux.Handle("POST /api/lyrics/lrclib", s.requireAuth(method(http.MethodPost, handlers.LRCLibExact(s.LRCLib))))
	mux.Handle("POST /api/lyrics/save", s.requireAuth(method(http.MethodPost, handlers.SaveLyrics(s.Store))))

	mux.Handle("POST /api/discover/youtube", s.requireAuth(method(http.MethodPost, handlers.DiscoverYouTube(s.YouTube))))
	mux.Handle("POST /api/discover/deezer/matches", s.requireAuth(method(http.MethodPost, handlers.MatchDeezerTracks(s.Deezer))))
	mux.Handle("POST /api/discover/deezer/custom-match", s.requireAuth(method(http.MethodPost, handlers.CustomDeezerMatch(s.Deezer))))
	mux.Handle("POST /api/discover/lyrics/options", s.requireAuth(method(http.MethodPost, handlers.LyricsOptions(s.LRCLib))))
	mux.Handle("POST /api/discover/lyrics/custom-search", s.requireAuth(method(http.MethodPost, handlers.CustomLyricsSearch(s.LRCLib))))
	mux.Handle("POST /api/discover/commit", s.requireAuth(method(http.MethodPost, handlers.CommitWorkflow(s.Store))))

	mux.HandleFunc("/", s.staticOrShell)
	return otelhttp.NewHandler(logRequests(mux), "http.server",
		otelhttp.WithFilter(func(r *http.Request) bool {
			return r.URL.Path != "/healthz" && r.URL.Path != "/metrics"
		}),
	)
}

func (s *Server) staticOrShell(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		handlers.Error(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		handlers.Error(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	if strings.HasPrefix(r.URL.Path, "/assets/") || r.URL.Path == "/manifest.webmanifest" {
		http.ServeFile(w, r, filepath.Join(s.WebDir, strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")))
		return
	}
	if !knownAppPath(r.URL.Path) {
		handlers.Error(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	if r.URL.Path != "/" && r.URL.Path != "/auth/native" {
		if _, err := s.Auth.SessionFromRequest(r); err != nil {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
	}
	http.ServeFile(w, r, filepath.Join(s.WebDir, "index.html"))
}

func knownAppPath(path string) bool {
	switch path {
	case "/", "/auth/native", "/home", "/settings", "/discover", "/discover/youtube", "/discover/spotify", "/discover/lyrics", "/discover/review", "/discover/commit":
		return true
	default:
		return isSongEditPath(path)
	}
}

func isSongEditPath(path string) bool {
	if !strings.HasPrefix(path, "/songs/") || !strings.HasSuffix(path, "/edit") {
		return false
	}
	id := strings.TrimSuffix(strings.TrimPrefix(path, "/songs/"), "/edit")
	return id != "" && !strings.Contains(id, "/")
}
