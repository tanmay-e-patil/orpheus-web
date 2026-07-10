# Plan: Searchable logs and distributed traces in Grafana

> Source: Request to make Orpheus Web logs searchable and correlate work across services in the existing Grafana deployment.

## Goal

Search production Orpheus Web logs in Grafana and follow a trace from an incoming HTTP request through database/external calls, RabbitMQ publication, and processing by `orpheus-consumer`.

## Assumptions

- Grafana and Prometheus are already deployed as separate Dokploy template applications on the same VPS.
- Orpheus Web and `../orpheus-consumer` run as containers and write logs to stdout/stderr.
- The consumer is deployed with Compose on the external `dokploy-network`; Alloy's OTLP endpoint must be reachable on that private network.
- Dokploy has no required Alloy template. Deploy Alloy as a small, separate Compose application using Grafana's official image and a version-controlled Alloy configuration.
- Loki and Tempo are not already installed. Reuse either service if it already exists; otherwise deploy them independently through a Dokploy template or Compose.

## Architectural decisions

- **Deployment boundary**: keep the existing Grafana and Prometheus template deployments unchanged. Run Alloy as its own Dokploy Compose application on `dokploy-network`; do not copy an Alloy sidecar into each application.
- **Telemetry pipeline**: Orpheus Web exports traces over private-network OTLP to Grafana Alloy; Alloy sends traces to Tempo. Alloy also ships application container stdout/stderr to Loki. Grafana queries both.
- **Application logging**: use Go's standard `log/slog` with JSON output. Include `trace_id` and `span_id` when the log context contains an active span.
- **Trace propagation**: use W3C `traceparent` and `tracestate`. HTTP instrumentation injects/extracts headers; RabbitMQ propagation uses AMQP headers with the same names and preserves existing job payloads.
- **Service identity**: set OpenTelemetry resources including `service.name`, `service.version`, `deployment.environment.name`, and host/container identity. Use distinct names for `orpheus-web` and `orpheus-consumer`.
- **Span scope**: trace inbound HTTP requests, PostgreSQL operations, supported outbound HTTP calls, RabbitMQ publish/consume/retry/DLQ/ack, and the consumer's `yt-dlp` and `ffmpeg` commands. Do not create spans for trivial internal functions.
- **Sampling**: use parent-based ratio sampling, configurable by environment; start at 100% for this low-volume service and reduce it if measured storage or CPU use warrants it.
- **Labels**: only stable, low-cardinality values such as `service`, `environment`, `level`, and `host`. Keep paths, user IDs, Library Song IDs, trace IDs, email addresses, and errors in the log body, not Loki labels.
- **Security**: do not record passwords, cookies, authorization headers, RabbitMQ/database URLs, configured credentials, request/response bodies, or email addresses. Sanitize database statements and outbound URLs.
- **Retention**: start with 14 days for logs and traces on local VPS storage; revisit only if disk usage requires it.
- **Failure behavior**: telemetry exporting must be bounded, asynchronous, and non-fatal. The application continues serving if Alloy, Loki, or Tempo is unavailable.

---

## Phase 1: Prove the end-to-end log pipeline

### What to build

Deploy Alloy as a separate Dokploy Compose application from a tiny observability deployment directory containing only `compose.yaml` and `config.alloy`. Join `dokploy-network`, expose OTLP only on that private network, and pin the official Alloy image version. Give Alloy read-only access to Docker container logs; if Docker discovery requires the Docker socket, document that this is privileged host access and restrict it to Alloy. Configure Alloy to discover both application containers, attach `service=orpheus-web` or `service=orpheus-consumer` plus `environment=production`, and send entries to independently deployed Loki. Add Loki as a Grafana data source.

### Acceptance criteria

- [ ] New Orpheus Web and consumer log lines appear in Grafana Explore within one minute.
- [ ] Service-label queries return only the selected application.
- [ ] Loki and Alloy restart automatically and retain their configuration across VPS reboots.
- [ ] Alloy is deployed without relying on a Dokploy template and its image version is pinned.
- [ ] Loki and Alloy's OTLP ports are reachable only from the VPS/private deployment network.
- [ ] Any Docker socket mount is read-only, isolated to Alloy, and called out in the runbook as privileged access.
- [ ] Existing Prometheus metrics and the application remain unaffected if Loki or Alloy is stopped.

---

## Phase 2: Make application logs consistently searchable

### What to build

Configure `log/slog` JSON output once at startup in both Go services and migrate production log statements to structured fields. Standardize `service`, `environment`, `level`, `component`, `message`, `job_id`, and `error`; HTTP request logs also include `method`, route pattern, status, response bytes, and duration. Preserve useful errors while removing credential and email-address logging. Keep raw `yt-dlp` and `ffmpeg` output on stdout/stderr, but correlate those lines by service, job ID in surrounding structured logs, and time rather than buffering potentially large subprocess output.

### Acceptance criteria

- [ ] Logs emitted by both Go services are valid one-line JSON on stdout/stderr; raw subprocess output remains ingestible.
- [ ] Grafana queries can filter by service, level, component, HTTP method, route pattern, status, and Library Song ID/job ID.
- [ ] Dynamic HTTP paths use the route pattern where available, rather than creating one value per song.
- [ ] No password, cookie, authorization header, connection URL, API key, or email address appears in logs.
- [ ] Existing request metrics and response behavior are unchanged.
- [ ] A small automated check verifies JSON fields and sensitive-value omission.

---

## Phase 3: Trace one Orpheus Web request

### What to build

Deploy single-node Tempo and configure Alloy as the private OTLP receiver. Initialize the OpenTelemetry SDK once during application startup with bounded batching and graceful shutdown. Instrument inbound HTTP requests first, then database and outbound HTTP operations so one request is visible end to end inside Orpheus Web.

### Acceptance criteria

- [ ] Grafana Explore can find a trace by trace ID and by `service.name=orpheus-web`.
- [ ] A trace shows the inbound route plus its database and supported outbound HTTP child spans.
- [ ] HTTP route templates are used instead of raw dynamic paths; secrets, query values, and bodies are absent.
- [ ] Errors set span status and record a useful sanitized error without changing the HTTP response.
- [ ] Missing or unavailable OTLP collection does not block or fail requests.
- [ ] Application shutdown flushes pending spans within a bounded timeout.
- [ ] An automated HTTP check confirms a valid server span is exported to an in-memory test exporter.

---

## Phase 4: Continue traces through RabbitMQ and `orpheus-consumer`

### What to build

Create a producer span around RabbitMQ publication and inject W3C trace context into AMQP headers. In `../orpheus-consumer`, extract context before creating the existing per-job timeout context, then keep it active through PostgreSQL lookup/update, cover-art HTTP download, `yt-dlp`, `ffmpeg`, lyrics writing, and acknowledgement. Instrument its existing delayed retry and DLQ publications; each retry publication replaces propagation headers with its current producer-span context. Jobs without trace headers continue as new root traces. Add signal-based graceful shutdown so the current forever-wait loop can flush telemetry.

### Acceptance criteria

- [ ] Published messages retain the current JSON body and existing `x-job-id`/`x-song-id` headers.
- [ ] New messages include valid `traceparent` and optional `tracestate` AMQP string headers.
- [ ] One Grafana trace crosses from `orpheus-web` into `orpheus-consumer` and shows publish, queue wait, database work, downloads, media commands, and acknowledgement timing.
- [ ] Consumer errors are recorded on the consumer span and remain associated with the same Library Song ID.
- [ ] Retry and DLQ publications preserve all existing headers, replace stale trace propagation headers, and create distinct delivery-attempt spans in the same trace.
- [ ] The existing three delayed retries (5s, 25s, 125s) and DLQ behavior are unchanged.
- [ ] Legacy producers and consumers remain compatible when propagation headers are absent.
- [ ] Contract tests prove web injection, consumer extraction, and retry reinjection preserve trace identity.

---

## Phase 5: Correlate logs, traces, and metrics in Grafana

### What to build

Configure Grafana data-source links between Loki and Tempo using `trace_id`, and from Tempo spans to relevant logs using service name and trace ID. Add dashboard links for recent errors, HTTP 5xx logs, slow traces, and RabbitMQ failures. Configure Loki/Tempo retention and disk limits, then extend the observability runbook.

### Acceptance criteria

- [ ] A structured log line emitted inside a span contains matching `trace_id` and `span_id` fields.
- [ ] Grafana can navigate from a log line to its trace and from a trace to logs from both services.
- [ ] The dashboard exposes recent errors, slow traces, HTTP 5xx responses, and queue failures without requiring LogQL or TraceQL knowledge.
- [ ] Existing Prometheus panels can link to traces for the selected service and time range where Grafana supports it.
- [ ] Log and trace retention are enforced and expected disk use is documented.
- [ ] The runbook covers health checks, disk-full behavior, restart commands, dropped telemetry, and ingestion verification.
- [ ] A smoke test submits one song-processing job and verifies the HTTP request, RabbitMQ handoff, consumer work, logs, and trace are correlated.

## Rollout

1. Deploy Loki and Alloy, then verify raw log ingestion.
2. Deploy structured logs with optional trace fields.
3. Deploy Tempo and trace one Orpheus Web request at 100% sampling.
4. Add RabbitMQ propagation, then deploy matching `orpheus-consumer` extraction.
5. Add Grafana correlations, retention, dashboard views, and runbook documentation.
6. Observe dropped telemetry, application overhead, and disk growth before adjusting sampling or retention.

## Intentionally out of scope

- Remote object storage or a multi-node Loki/Tempo cluster.
- Tail-based sampling; add it only if head sampling measurably loses important error traces.
- Log-derived alerts; existing Prometheus metrics remain the alerting source until a concrete missing alert is identified.
- Shipping browser-console logs or browser traces.
