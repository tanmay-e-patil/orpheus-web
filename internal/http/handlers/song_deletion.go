package handlers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"orpheus-web/internal/store"
)

// DeleteSong runs behind requireAuth, like the other shared-library mutations.
func DeleteSong(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		trackID := r.PathValue("trackId")
		queued, err := db.DeleteSong(r.Context(), trackID)
		if err != nil {
			var pgErr *pgconn.PgError
			switch {
			case errors.Is(err, pgx.ErrNoRows):
				Error(w, http.StatusNotFound, "not_found", "Song not found")
			case errors.As(err, &pgErr) && pgErr.Code == "55P03":
				w.Header().Set("Retry-After", "3")
				Error(w, http.StatusServiceUnavailable, "song_busy", "Song is being processed. Please try again.")
			default:
				slog.ErrorContext(r.Context(), "song deletion failed", "component", "api", "track_id", trackID, "error", err)
				Error(w, http.StatusInternalServerError, "song_delete_failed", "Could not delete song")
			}
			return
		}
		if !queued {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		JSON(w, http.StatusAccepted, map[string]any{"trackId": trackID, "deletionQueued": true})
	}
}
