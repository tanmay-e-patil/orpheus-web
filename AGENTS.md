# Agent guide

## Package manager

Use Bun for the frontend. Never run npm, npx, yarn, or pnpm, and never commit their lockfiles. A `preinstall` guard in `frontend/package.json` fails installs from any other package manager.

- Install: `bun install --cwd frontend --frozen-lockfile`. Add a package with `bun add <pkg>` or `bun add -d <pkg>` inside `frontend/`.
- Run scripts with `bun run`: `bun run --cwd frontend check`, `bun run --cwd frontend test`, `bun run --cwd frontend build`.
- Run one-off tools with `bunx`, not `npx`.
- Use `bun run test`, not `bun test`. `bun test` starts Bun's own test runner and skips the Vitest setup.

## Tests

Test layers: Go unit tests (`go test ./...`), Go integration tests against PostgreSQL and RabbitMQ (`go test -race -tags=integration ./...`, including `integration/`), and frontend component and unit tests with Vitest in `frontend/tests` (`bun run --cwd frontend test`).

- Write the test before the code. A unit test written after the code restates it.
- Prefer integration tests that drive the real entry point: an HTTP handler, the outbox dispatcher, or a rendered Svelte page. Have each one leave an artifact a reviewer can check and repeat (a response, persisted rows, a published message, a request payload).
- Before you test a part in isolation, write down the ways it can fail. Test those.
- A test that breaks under a refactor that keeps the behavior asserts the implementation. Do not add it. In frontend tests, assert actions, request payloads, persisted state, and accessible roles and state, not copy, CSS classes, or element order.
- Never delete or weaken a failing test to make the suite pass. Fix the code, or ask.
