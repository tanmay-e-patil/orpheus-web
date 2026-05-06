package handlers

import "net/http"

func Health(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]string{"ok": "true"})
}
