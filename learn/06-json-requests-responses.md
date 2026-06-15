# Lesson 06: JSON, Struct Tags, Requests, and Responses

Good files:

- [`../internal/types/songs.go`](../internal/types/songs.go)
- [`../internal/http/handlers/respond.go`](../internal/http/handlers/respond.go)
- [`../internal/http/handlers/songs.go`](../internal/http/handlers/songs.go)

## JSON response helper

In [`../internal/http/handlers/respond.go`](../internal/http/handlers/respond.go):

```go
func JSON(w http.ResponseWriter, status int, value any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(value)
}
```

This writes JSON to the HTTP response.

`any` means any type. It is an alias for `interface{}`.

The `_ =` means “ignore this returned value.”

`Encode` returns an error, but this helper intentionally ignores it.

## Error response shape

```go
type ErrorBody struct {
    Error APIError `json:"error"`
}

type APIError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}
```

This becomes JSON like:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Unauthorized"
  }
}
```

## Struct tags

```go
TrackID string `json:"trackId"`
```

The backtick part is a struct tag.

Go field name:

```go
TrackID
```

JSON field name:

```json
"trackId"
```

## `omitempty`

```go
AudioURL string `json:"audioUrl,omitempty"`
```

If `AudioURL` is empty, omit it from JSON.

For strings, empty means:

```go
""
```

For pointers, empty means:

```go
nil
```

## Decoding JSON requests

```go
func DecodeJSON(r *http.Request, dst any) error {
    if r.Body == nil {
        return errors.New("request body required")
    }
    decoder := json.NewDecoder(r.Body)
    decoder.DisallowUnknownFields()
    return decoder.Decode(dst)
}
```

`dst` means destination.

Call site:

```go
var body types.SaveLyricsRequest
if err := DecodeJSON(r, &body); err != nil {
    Error(w, http.StatusBadRequest, "bad_request", "Invalid lyrics save request")
    return
}
```

Why `&body`?

Because `DecodeJSON` needs to modify `body`. `&body` passes a pointer.

## Request body struct

```go
type SaveLyricsRequest struct {
    TrackID      string `json:"trackId"`
    SpotifyID    string `json:"spotifyId"`
    PlainLyrics  string `json:"plainLyrics"`
    SyncedLyrics string `json:"syncedLyrics"`
}
```

Example JSON request:

```json
{
  "trackId": "abc123",
  "plainLyrics": "hello",
  "syncedLyrics": ""
}
```

## Response struct

```go
type SongsPageResponse struct {
    Songs        []LibrarySong `json:"songs"`
    NextCursor   *SongCursor   `json:"nextCursor"`
    HasMore      bool          `json:"hasMore"`
    PageRevision string        `json:"pageRevision"`
}
```

This contains:

- a slice of songs
- optional next cursor
- boolean has more
- string page revision

## Inline map response

In [`../internal/http/handlers/songs.go`](../internal/http/handlers/songs.go):

```go
JSON(w, http.StatusOK, map[string]bool{"ok": true})
```

This returns:

```json
{"ok": true}
```

## Query params

```go
params := r.URL.Query()
raw := params.Get("limit")
```

Query string:

```txt
/api/songs?limit=25
```

`params.Get("limit")` returns:

```txt
"25"
```

It is always a string, so the code converts it:

```go
parsed, err := strconv.Atoi(raw)
```

## Checkpoint

You should now understand:

- JSON encoding
- JSON decoding
- struct tags
- `omitempty`
- passing pointers to decode into structs
- query params
- inline map responses
