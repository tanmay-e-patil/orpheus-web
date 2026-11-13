# Agent guide

## Tests

Test layers: Go unit tests (`go test ./...`), Go integration tests against PostgreSQL and RabbitMQ (`go test -race -tags=integration ./...`, including `integration/`), and frontend component and unit tests with Vitest in `frontend/tests` (`npm test --prefix frontend`).

- Write the test before the code. A unit test written after the code restates it.
- Prefer integration tests that drive the real entry point: an HTTP handler, the outbox dispatcher, or a rendered Svelte page. Have each one leave an artifact a reviewer can check and repeat (a response, persisted rows, a published message, a request payload).
- Before you test a part in isolation, write down the ways it can fail. Test those.
- A test that breaks under a refactor that keeps the behavior asserts the implementation. Do not add it. In frontend tests, assert actions, request payloads, persisted state, and accessible roles and state, not copy, CSS classes, or element order.
- Never delete or weaken a failing test to make the suite pass. Fix the code, or ask.
