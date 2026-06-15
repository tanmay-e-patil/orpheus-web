# Lesson 03: Variables, Types, Structs, and Config

File: [`../internal/config/config.go`](../internal/config/config.go)

This file is a beginner-friendly place to learn Go types.

## Package

```go
package config
```

Files in this folder belong to the `config` package.

Other code imports it like this:

```go
import "orpheus-web/internal/config"
```

Then calls:

```go
cfg, err := config.Load()
```

## Structs

```go
type Config struct {
    DatabaseURL      string
    AuthCookieSecret string
    CookieSecure     bool
    HTTPTimeout      time.Duration
}
```

A struct groups fields together.

Rough TypeScript equivalent:

```ts
type Config = {
  databaseURL: string
  authCookieSecret: string
  cookieSecure: boolean
  httpTimeout: Duration
}
```

But in Go, field names are usually `PascalCase` if they need to be exported.

## Basic types seen here

```go
string
bool
int
time.Duration
```

Examples:

```go
var name string = "orpheus"
var secure bool = true
var seconds int = 15
```

Go can infer types:

```go
name := "orpheus"
secure := true
seconds := 15
```

## Struct literals

```go
cfg := Config{
    DatabaseURL: os.Getenv("DATABASE_URL"),
    Port:        getenv("PORT", "8080"),
    AppEnv:      getenv("APP_ENV", "development"),
    HTTPTimeout: 15 * time.Second,
}
```

This creates a `Config` value.

Named fields make it clear which value goes where.

## Assignment after creation

```go
cfg.CookieSecure = cfg.AppEnv == "production"
```

This sets a field after the struct is created.

`==` compares values.

So this means:

```txt
CookieSecure is true if AppEnv equals "production"
```

## Reading environment variables

```go
os.Getenv("DATABASE_URL")
```

Returns a string. If the env var does not exist, it returns `""`.

This helper wraps that behavior:

```go
func getenv(key, fallback string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return fallback
}
```

If the env var exists, return it. Otherwise return the fallback.

## Functions

```go
func Load() (Config, error) {
```

This function returns two values:

1. `Config`
2. `error`

The caller checks the error:

```go
cfg, err := config.Load()
if err != nil {
    // failed
}
```

## Slices

```go
var missing []string
```

A slice is a dynamic list.

Add to it with `append`:

```go
missing = append(missing, "DATABASE_URL")
```

## Maps

```go
for name, value := range map[string]string{
    "DATABASE_URL":       cfg.DatabaseURL,
    "AUTH_COOKIE_SECRET": cfg.AuthCookieSecret,
} {
    if strings.TrimSpace(value) == "" {
        missing = append(missing, name)
    }
}
```

This creates a temporary map from string to string.

```go
map[string]string
```

means:

```txt
keys are strings
values are strings
```

## Loops with `range`

```go
for name, value := range someMap {
    ...
}
```

For maps, `range` gives key and value.

For slices, it gives index and value:

```go
for i, item := range items {
    ...
}
```

## Converting strings to numbers

```go
seconds, err := strconv.Atoi(raw)
```

`Atoi` means ASCII to integer.

If `raw` is not a valid number, `err` is non-nil.

## Durations

```go
cfg.HTTPTimeout = time.Duration(seconds) * time.Second
```

`time.Duration` represents time internally as nanoseconds.

Common examples:

```go
5 * time.Second
10 * time.Minute
1 * time.Hour
```

## Returning errors

```go
return Config{}, fmt.Errorf("invalid HTTP_TIMEOUT_SECONDS: %q", raw)
```

`Config{}` is the zero-value config.

`fmt.Errorf` creates an error with formatted text.

## Zero values

Go variables always have a value.

Common zero values:

```txt
string -> ""
int    -> 0
bool   -> false
pointer -> nil
slice  -> nil
map    -> nil
```

## Checkpoint

You should now understand:

- structs
- fields
- basic types
- `:=`
- functions with multiple return values
- slices
- maps
- loops with `range`
- zero values
- env var loading
