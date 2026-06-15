# Lesson 08: Database Code with Postgres and pgx

Good files:

- [`../internal/store/db.go`](../internal/store/db.go)
- [`../internal/store/songs.go`](../internal/store/songs.go)

This project uses `pgx`, a PostgreSQL driver for Go.

## Store type

```go
type Store struct {
    Pool *pgxpool.Pool
}
```

`Store` wraps the database connection pool.

Other packages use `*store.Store` instead of directly managing database connections.

## Opening the database

```go
func Open(ctx context.Context, databaseURL string) (*Store, error) {
    pool, err := pgxpool.New(ctx, databaseURL)
    if err != nil {
        return nil, err
    }
    if err := pool.Ping(ctx); err != nil {
        pool.Close()
        return nil, err
    }
    return &Store{Pool: pool}, nil
}
```

Steps:

1. Create pool
2. Ping DB to verify connection
3. Return store

`&Store{Pool: pool}` creates a `Store` and returns its address.

## Querying many rows

```go
rows, err := s.Pool.Query(ctx, query, args...)
if err != nil {
    return types.SongsPageResponse{}, err
}
defer rows.Close()
```

Always close rows.

Then iterate:

```go
for rows.Next() {
    var song types.LibrarySong
    if err := rows.Scan(&song.TrackID, &song.Name); err != nil {
        return types.SongsPageResponse{}, err
    }
    songs = append(songs, song)
}
if err := rows.Err(); err != nil {
    return types.SongsPageResponse{}, err
}
```

`rows.Err()` catches errors that happened during iteration.

## Querying one row

```go
err := s.Pool.QueryRow(ctx, `
    select id, name, artist_name
    from songs
    where id = $1
`, trackID).Scan(&song.TrackID, &song.Name, &song.ArtistName)
```

`$1` is a parameter placeholder.

Passing parameters separately prevents SQL injection.

## Nullable database values

```go
var lyrics sql.NullString
var isLyrics sql.NullBool
```

SQL columns can be null. Go strings and bools cannot represent null by themselves.

`sql.NullString` has:

```go
String string
Valid  bool
```

Usage:

```go
if lyrics.Valid {
    song.Lyrics = lyrics.String
}
```

## Insert/update with returning

```go
err = s.Pool.QueryRow(ctx, `
    insert into user_song_plays (...)
    values ($1, $2, 1, now(), now(), now())
    on conflict (user_id, track_id)
    do update set
      play_count = user_song_plays.play_count + 1,
      last_played_at = now(),
      updated_at = now()
    returning play_count, last_played_at
`, userID, trackID).Scan(&play.PlayCount, &play.LastPlayedAt)
```

This inserts a play record or updates the existing one.

`returning` lets Postgres send values back.

## Exec for commands

```go
tag, err := s.Pool.Exec(ctx, `update songs set album_art = $1 where id = $2`, albumArt, trackID)
```

`Exec` is for queries that do not return rows.

Check affected rows:

```go
if tag.RowsAffected() == 0 {
    return fmt.Errorf("song not found: %s", trackID)
}
```

## Building dynamic SQL

```go
var args []any
var predicates []string

if filter.UpdatedAfter != nil {
    args = append(args, *filter.UpdatedAfter)
    predicates = append(predicates, fmt.Sprintf("updated_at >= $%d", len(args)))
}
```

This carefully builds SQL while still using parameters.

Important: values go in `args`, not string concatenation.

Good:

```go
where id = $1
```

Bad:

```go
"where id = '" + trackID + "'"
```

## Embedded migrations

In [`../internal/store/db.go`](../internal/store/db.go):

```go
//go:embed migrations/*.up.sql
var migrationsFS embed.FS
```

This embeds SQL migration files into the Go binary.

So when the app is built, migration files are included inside the executable.

## Checkpoint

You should now understand:

- connection pools
- `Query`
- `QueryRow`
- `Exec`
- `Scan`
- SQL parameters
- nullable SQL values
- dynamic SQL with args
- embedded migration files
