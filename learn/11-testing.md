# Lesson 11: Testing Go Code

This project already has tests.

Examples:

```txt
internal/services/matcher_test.go
internal/types/songs_test.go
internal/http/auth_test.go
internal/http/handlers/respond_test.go
```

## Run all tests

From project root:

```sh
go test ./...
```

`./...` means all packages recursively.

## Run one package

```sh
go test ./internal/services
```

## Test file naming

Go test files end with:

```txt
_test.go
```

## Basic test shape

A test function looks like:

```go
func TestSomething(t *testing.T) {
    got := someFunction()
    want := "expected"

    if got != want {
        t.Fatalf("got %q, want %q", got, want)
    }
}
```

Rules:

- name starts with `Test`
- takes `t *testing.T`
- lives in a `_test.go` file

## Table-driven tests

Go often uses table-driven tests.

Example style:

```go
func TestParseISODurationSeconds(t *testing.T) {
    tests := []struct {
        name string
        input string
        want int
    }{
        {name: "minutes and seconds", input: "PT3M20S", want: 200},
        {name: "hours", input: "PT1H", want: 3600},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := ParseISODurationSeconds(tt.input)
            if got != tt.want {
                t.Fatalf("got %d, want %d", got, tt.want)
            }
        })
    }
}
```

## `t.Run`

`t.Run` creates a subtest.

This makes test output clearer when one case fails.

## Testing handlers

Go has `httptest` for HTTP tests.

Typical shape:

```go
req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
rec := httptest.NewRecorder()

handler.ServeHTTP(rec, req)

if rec.Code != http.StatusOK {
    t.Fatalf("status got %d", rec.Code)
}
```

`httptest.NewRecorder()` records the response without starting a real server.

## Testing pure functions

Pure functions are easiest to test.

Example from [`../internal/services/matcher.go`](../internal/services/matcher.go):

```go
func CleanString(input string) string
func StringSimilarity(a, b string) float64
func LevenshteinDistance(a, b string) int
func ParseISODurationSeconds(duration string) int
```

These do not need a database, network, or server.

## Checkpoint

You should now understand:

- `go test ./...`
- `_test.go` files
- `TestXxx(t *testing.T)`
- table-driven tests
- subtests
- `httptest`
