# Orpheus Web observability

Prometheus runs on the same VPS. Add this scrape target to the existing Prometheus deployment:

```yaml
scrape_configs:
  - job_name: orpheus-web
    static_configs:
      - targets: ['127.0.0.1:8080']
```

`/metrics` is unauthenticated; keep it reachable only from the VPS/private network.

Import `deploy/grafana/orpheus-web-dashboard.json` into Grafana.
