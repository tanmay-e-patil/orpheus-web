# Lesson 13: Mini Exercises in This Codebase

These exercises use the actual project. Do them in order.

Run tests after each exercise:

```sh
go test ./...
```

## Exercise 1: Add a config field

File: [`../internal/config/config.go`](../internal/config/config.go)

Add a field:

```go
LogLevel string
```

Load it from:

```txt
LOG_LEVEL
```

Default to:

```txt
info
```

Hint: use existing helper:

```go
getenv("LOG_LEVEL", "info")
```

Concepts practiced:

- structs
- env vars
- string fields

## Exercise 2: Add a version endpoint

Files:

- [`../internal/http/router.go`](../internal/http/router.go)
- maybe [`../internal/http/handlers/health.go`](../internal/http/handlers/health.go)

Add route:

```txt
GET /api/version
```

Return:

```json
{"version":"dev"}
```

Hint handler:

```go
func Version(w http.ResponseWriter, r *http.Request) {
    JSON(w, http.StatusOK, map[string]string{"version": "dev"})
}
```

Concepts practiced:

- handlers
- routes
- JSON responses

## Exercise 3: Test a pure function

File: [`../internal/services/matcher_test.go`](../internal/services/matcher_test.go)

Add tests for:

```go
ParseISODurationSeconds
```

Cases:

```txt
PT3M20S -> 200
PT1H -> 3600
PT1H2M3S -> 3723
bad -> 0
```

Concepts practiced:

- tests
- table-driven tests
- pure functions

## Exercise 4: Add `CountSongs`

File: [`../internal/store/songs.go`](../internal/store/songs.go)

Add:

```go
func (s *Store) CountSongs(ctx context.Context) (int, error) {
    var count int
    err := s.Pool.QueryRow(ctx, `select count(*) from songs`).Scan(&count)
    if err != nil {
        return 0, err
    }
    return count, nil
}
```

Concepts practiced:

- methods
- database query
- `QueryRow`
- `Scan`
- error returns

## Exercise 5: Add `availableOnly` query param

File: [`../internal/http/handlers/songs.go`](../internal/http/handlers/songs.go)

Goal:

```txt
GET /api/songs?availableOnly=true
```

Only return available songs.

This is more involved because filtering belongs in the store layer.

Suggested steps:

1. Add field to `store.FetchSongsOptions`:

```go
AvailableOnly bool
```

2. Read query param in handler:

```go
availableOnly := params.Get("availableOnly") == "true"
```

3. Pass it into `FetchSongsOptions`.

4. Update SQL building in `FetchSongsPage` to add:

```sql
coalesce(songs.is_available, false) = true
```

Concepts practiced:

- structs
- query params
- SQL building
- cross-package changes

## Exercise 6: Add tests for `CleanString`

File: [`../internal/services/matcher_test.go`](../internal/services/matcher_test.go)

Cases:

```txt
"Hello, World!" -> "hello world"
" A   B " -> "a b"
"Beyoncé" -> "beyoncé"
```

Concepts practiced:

- Unicode
- string cleaning
- table tests

## Exercise 7: Read an HTTP handler out loud

File: [`../internal/http/handlers/songs.go`](../internal/http/handlers/songs.go)

Pick `RecordSongPlay` and explain each line:

- what dependencies it receives
- where it gets user ID
- where it gets track ID
- what DB method it calls
- what each error case means
- what JSON it returns

Concepts practiced:

- code reading
- handlers
- errors
- responses

## Final challenge

Add a new endpoint:

```txt
GET /api/songs/count
```

Return:

```json
{"count":123}
```

Use your `CountSongs` method.

This combines:

- route registration
- handler creation
- store method
- JSON response
- tests if you want to go further
