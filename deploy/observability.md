# Orpheus observability

Grafana and Prometheus already run as Dokploy template applications. Logs and traces use the separate Compose project in `deploy/telemetry/`; it does not replace either existing deployment.

## 1. Prometheus metrics

Add the existing private scrape target:

```yaml
scrape_configs:
  - job_name: orpheus-web
    static_configs:
      - targets: ['orpheus-web:8080']
```

`/metrics` is unauthenticated; keep it reachable only from `dokploy-network`.

## 2. Deploy Alloy, Loki, and Tempo

Create a Dokploy Compose application from `deploy/telemetry/compose.yaml`. The relative configuration mounts require these four files in the application working directory:

- `compose.yaml`
- `config.alloy`
- `loki.yaml`
- `tempo.yaml`

All services join the existing external `dokploy-network`; no telemetry port is published on the host. Alloy's read-only Docker socket mount can inspect the Docker daemon and must not be shared with application containers.

Validate after deployment:

```sh
docker compose -f deploy/telemetry/compose.yaml ps
docker compose -f deploy/telemetry/compose.yaml logs alloy loki tempo
```

The application images carry an `observability.service` label used by Alloy discovery. If Dokploy replaces image labels, add the same container labels in Dokploy:

```text
orpheus-web:      observability.service=orpheus-web
orpheus-consumer: observability.service=orpheus-consumer
```

Both applications export traces to `http://alloy:4318` using OTLP HTTP. Override these defaults when needed:

```text
OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_SAMPLER_ARG=1
APP_VERSION=<release-or-commit>
```

`OTEL_TRACES_SAMPLER_ARG` accepts `0` through `1`. Start at `1`; reduce it only after measuring storage or application overhead.

## 3. Grafana data sources

In the existing Grafana deployment, add:

- **Loki**: `http://loki:3100`
- **Tempo**: `http://tempo:3200`

Both URLs are private Docker DNS names on `dokploy-network`.

Configure Loki's **Derived fields**:

- Name: `TraceID`
- Regex: `"trace_id":"([0-9a-f]{32})"`
- Internal link: the Tempo data source
- URL/query value: `${__value.raw}`

Configure Tempo's **Trace to logs**:

- Loki data source: the Loki source above
- Tags: map `service.name` to `service`
- Filter by trace ID: enabled
- Span start/end shift: `-1m` / `1m`

Import `deploy/grafana/orpheus-web-dashboard.json` and select the Prometheus, Loki, and Tempo data sources when prompted.

## 4. Smoke test

1. Open Orpheus and commit or regenerate one Library Song.
2. In Grafana Explore, query Loki with `{service="orpheus-web"}` and open the log's `TraceID` link.
3. Confirm the trace contains `orpheus-web`, a RabbitMQ producer span, `orpheus-consumer`, PostgreSQL spans, and `yt-dlp`/`ffmpeg` spans.
4. From the trace, open correlated logs and confirm both services appear.

Jobs published before deployment have no `traceparent`; the consumer correctly starts a new trace for them.

## Operations

- Retention is 14 days (`336h`) for Loki and Tempo.
- Persistent data lives in the `loki-data` and `tempo-data` Docker volumes.
- If disk fills, stop telemetry first; application requests and jobs continue because exporters are asynchronous and non-fatal.
- Check dropped/export failures in Alloy logs: `docker compose logs alloy | grep -iE 'drop|fail|error'`.
- Restart only the telemetry pipeline with `docker compose restart alloy loki tempo`.
- Never expose Loki, Tempo, Alloy OTLP, or Alloy's UI directly to the public internet.
