# Lesson 12: Concurrency with Mutexes

Good file: [`../internal/services/queue.go`](../internal/services/queue.go)

This lesson introduces concurrency safety.

## Shared state

```go
type QueuePublisher struct {
    url  string
    mu   sync.Mutex
    conn *amqp.Connection
    ch   *amqp.Channel
}
```

This struct stores a RabbitMQ connection and channel.

Multiple HTTP requests can happen at the same time. That means multiple goroutines might use the same `QueuePublisher`.

Without protection, two goroutines could modify `conn` or `ch` at the same time.

## Mutex

```go
mu sync.Mutex
```

A mutex is a lock.

Only one goroutine can hold the lock at a time.

## Lock and unlock

```go
q.mu.Lock()
defer q.mu.Unlock()
```

This means:

1. Take the lock
2. Do protected work
3. Release the lock when function returns

Using `defer` prevents accidentally forgetting to unlock.

## Example from `Close`

```go
func (q *QueuePublisher) Close() {
    q.mu.Lock()
    defer q.mu.Unlock()
    if q.ch != nil {
        _ = q.ch.Close()
    }
    if q.conn != nil {
        _ = q.conn.Close()
    }
    q.ch = nil
    q.conn = nil
}
```

This safely closes and clears the connection/channel.

## Lazy connection

```go
func (q *QueuePublisher) channel() (*amqp.Channel, error) {
    q.mu.Lock()
    defer q.mu.Unlock()
    if q.ch != nil && !q.ch.IsClosed() {
        return q.ch, nil
    }
    conn, err := amqp.Dial(q.url)
    ...
}
```

This only opens a RabbitMQ connection when needed.

If one already exists, it reuses it.

## Reset on failure

```go
func (q *QueuePublisher) reset() {
    q.mu.Lock()
    defer q.mu.Unlock()
    ...
    q.ch = nil
    q.conn = nil
}
```

If publishing fails, the code resets the connection so the next attempt can reconnect.

## Important warning

Do not copy structs that contain a mutex after they are used.

This project passes `*QueuePublisher`, a pointer, which is correct.

## Checkpoint

You should now understand:

- goroutines may access shared state concurrently
- mutexes protect shared state
- `Lock` / `Unlock`
- using `defer` with unlock
- lazy resource creation
