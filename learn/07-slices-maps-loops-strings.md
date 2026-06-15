# Lesson 07: Slices, Maps, Loops, and Strings

Good files:

- [`../internal/store/songs.go`](../internal/store/songs.go)
- [`../internal/store/db.go`](../internal/store/db.go)
- [`../internal/services/matcher.go`](../internal/services/matcher.go)

## Slices

A slice is Go's dynamic list type.

```go
songs := make([]types.LibrarySong, 0, limit)
```

This means:

```txt
create a slice of LibrarySong
length starts at 0
capacity starts at limit
```

Add items:

```go
songs = append(songs, song)
```

Slice the slice:

```go
songs = songs[:limit]
```

This keeps only the first `limit` items.

## Nil slices

```go
if len(trackIDs) == 0 {
    return nil, nil
}
```

A nil slice often means no items.

It is safe to call `len` on a nil slice.

## Maps

In [`../internal/store/db.go`](../internal/store/db.go):

```go
applied := make(map[string]bool)
```

This creates a map where:

- keys are strings
- values are bools

Set a value:

```go
applied[v] = true
```

Read a value:

```go
if applied[version] {
    continue
}
```

If a key is missing, Go returns the zero value. For bool, that is `false`.

## Loops over rows

```go
for rows.Next() {
    var song types.LibrarySong
    if err := rows.Scan(&song.TrackID, &song.Name); err != nil {
        return nil, err
    }
    songs = append(songs, song)
}
```

This loops until there are no more database rows.

## Loop over slice

In [`../internal/store/db.go`](../internal/store/db.go):

```go
for _, entry := range entries {
    ...
}
```

`range` over a slice gives:

```go
index, value
```

The `_` ignores the index.

## Strings

Strings are immutable UTF-8 byte sequences.

In [`../internal/services/matcher.go`](../internal/services/matcher.go):

```go
for _, r := range strings.ToLower(input) {
    if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) || r == '_' {
        b.WriteRune(r)
    } else {
        b.WriteRune(' ')
    }
}
```

`range` over a string gives runes, not bytes.

A `rune` is a Unicode code point.

## `strings.Builder`

```go
var b strings.Builder
b.WriteRune(r)
return b.String()
```

Use `strings.Builder` when building a string piece by piece.

This is better than repeated `out += piece` in a loop.

## Regular expressions

```go
var whitespace = regexp.MustCompile(`\s+`)
```

This compiles a regex once at package load time.

Used here:

```go
whitespace.ReplaceAllString(b.String(), " ")
```

That replaces repeated whitespace with a single space.

## Variadic expansion

In [`../internal/store/songs.go`](../internal/store/songs.go):

```go
rows, err := s.Pool.Query(ctx, query, args...)
```

`args` is a slice:

```go
args := []any{limit + 1, opts.UserID}
```

`args...` expands the slice into separate arguments.

## Checkpoint

You should now understand:

- slices
- `append`
- `len`
- nil slices
- maps
- range loops
- strings vs runes
- `strings.Builder`
- regex basics
- `args...`
