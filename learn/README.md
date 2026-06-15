# Learning Go Through This Project

This directory teaches Go from zero using the Go code in this project.

You do **not** need to know Go before starting. Read in order:

1. [Lesson 01: What a Go Project Looks Like](./01-project-shape.md)
2. [Lesson 02: The App Entrypoint, Line by Line](./02-main-line-by-line.md)
3. [Lesson 03: Variables, Types, Structs, and Config](./03-config-structs-and-types.md)
4. [Lesson 04: Functions, Methods, Pointers, and Errors](./04-functions-methods-pointers-errors.md)
5. [Lesson 05: HTTP Servers, Handlers, and Middleware](./05-http-handlers-middleware.md)
6. [Lesson 06: JSON, Struct Tags, Requests, and Responses](./06-json-requests-responses.md)
7. [Lesson 07: Slices, Maps, Loops, and Strings](./07-slices-maps-loops-strings.md)
8. [Lesson 08: Database Code with Postgres and pgx](./08-database-pgx.md)
9. [Lesson 09: Context, Defer, Goroutines, and Shutdown](./09-context-defer-goroutines.md)
10. [Lesson 10: Interfaces and Dependency Injection](./10-interfaces-dependency-injection.md)
11. [Lesson 11: Testing Go Code](./11-testing.md)
12. [Lesson 12: Concurrency with Mutexes](./12-concurrency-mutexes.md)
13. [Lesson 13: Mini Exercises in This Codebase](./13-exercises.md)

## Useful commands

From the project root:

```sh
go test ./...
go test ./internal/services
go run ./cmd/orpheus
```

## The most important Go habit

Most Go functions return an error:

```go
value, err := doSomething()
if err != nil {
    return err
}
```

You will see this pattern everywhere in this project.
