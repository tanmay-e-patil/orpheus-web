# Lesson 04: Functions, Methods, Pointers, and Errors

Good files for this lesson:

- [`../internal/store/db.go`](../internal/store/db.go)
- [`../internal/store/songs.go`](../internal/store/songs.go)
- [`../internal/types/songs.go`](../internal/types/songs.go)

## Functions

A normal function:

```go
func Open(ctx context.Context, databaseURL string) (*Store, error) {
    ...
}
```

This means:

```txt
name: Open
parameters:
  ctx context.Context
  databaseURL string
returns:
  *Store
  error
```

Call it like:

```go
db, err := store.Open(ctx, cfg.DatabaseURL)
```

## Methods

A method is a function attached to a type.

```go
func (s *Store) Close() {
    ...
}
```

The receiver is:

```go
(s *Store)
```

This means `Close` belongs to `*Store`.

Call it like:

```go
db.Close()
```

## Why pointer receivers?

```go
func (s *Store) Close()
```

`*Store` means pointer to `Store`.

A pointer lets the method use the same object, not a copy.

This matters when the struct contains shared resources like a database pool:

```go
type Store struct {
    Pool *pgxpool.Pool
}
```

## Pointers

A pointer stores the address of another value.

```go
value := true
ptr := &value
```

`&value` means “address of value.”

A pointer can be `nil`.

This project uses pointers for optional data:

```go
type SongsPageResponse struct {
    NextCursor *SongCursor `json:"nextCursor"`
}
```

If there is no next page:

```go
NextCursor: nil
```

## Pointer to bool

```go
IsLyricsAvailable *bool `json:"isLyricsAvailable,omitempty"`
```

Why not plain `bool`?

Because plain bool has only:

```txt
true
false
```

Pointer bool has:

```txt
nil     -> unknown/not present
&true   -> true
&false  -> false
```

This is useful for nullable database columns.

## Errors

Go usually returns errors instead of throwing exceptions.

Example:

```go
func (s *Store) SongForAudio(ctx context.Context, trackID string) (types.AudioSong, error) {
    var song types.AudioSong
    err := s.Pool.QueryRow(ctx, `select ...`).Scan(&song.TrackID)
    if err != nil {
        return types.AudioSong{}, err
    }
    return song, nil
}
```

Success returns:

```go
return song, nil
```

Failure returns:

```go
return types.AudioSong{}, err
```

## Sentinel errors

In [`../internal/store/songs.go`](../internal/store/songs.go):

```go
var ErrSongUnavailable = fmt.Errorf("song unavailable")
```

Handlers can compare against it:

```go
if errors.Is(err, store.ErrSongUnavailable) {
    Error(w, http.StatusConflict, "unavailable", "Song unavailable")
    return
}
```

## Wrapping errors

In [`../internal/store/db.go`](../internal/store/db.go):

```go
return fmt.Errorf("migration %s failed: %w", version, err)
```

`%w` wraps the original error.

This preserves the original error for `errors.Is` checks.

## `nil`

`nil` means no value for pointer-like types.

Examples:

```go
if s != nil && s.Pool != nil {
    s.Pool.Close()
}
```

This avoids crashing if `s` or `s.Pool` is missing.

## Methods in this project

Examples:

```go
func (s *Store) MigrateUp(ctx context.Context) error
func (s *Store) FetchSongsPage(ctx context.Context, opts FetchSongsOptions) (types.SongsPageResponse, error)
func (s *Store) RecordSongPlay(ctx context.Context, userID, trackID string) (RecordedSongPlay, error)
```

These all operate on `Store`.

## Checkpoint

You should now understand:

- normal functions
- methods
- receivers
- pointers
- `nil`
- error returns
- sentinel errors
- wrapped errors
