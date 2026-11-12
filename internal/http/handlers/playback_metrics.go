package handlers

import (
	"net/http"
	"time"

	"orpheus-web/internal/metrics"
)

// Reports above this are abandoned or backgrounded tabs, not real start times.
const maxPlaybackStart = 60 * time.Second

type playbackStartReport struct {
	Seconds    float64 `json:"seconds"`
	Trigger    string  `json:"trigger"`
	Prefetched bool    `json:"prefetched"`
}

// RecordPlaybackStart accepts one browser measurement per song start. Labels
// are validated against fixed values so clients cannot create new series.
func RecordPlaybackStart(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	var report playbackStartReport
	if err := DecodeJSON(r, &report); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "Invalid playback start report")
		return
	}
	duration := time.Duration(report.Seconds * float64(time.Second))
	if report.Seconds <= 0 || duration > maxPlaybackStart {
		Error(w, http.StatusBadRequest, "bad_duration", "Playback start duration out of range")
		return
	}
	if report.Trigger != "manual" && report.Trigger != "auto" {
		Error(w, http.StatusBadRequest, "bad_trigger", "Trigger must be manual or auto")
		return
	}
	metrics.ObservePlaybackStart(report.Trigger, report.Prefetched, duration)
	w.WriteHeader(http.StatusNoContent)
}
