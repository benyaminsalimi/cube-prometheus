# Changelog

The version of this package mirrors the Cube release it is verified against:
`@cube_oss/cube-prometheus@X.Y.Z` is tested against `cubejs/cube:vX.Y.Z`. There are no
independent minor or patch releases — a fix that must ship between Cube releases still
needs a Cube version to track, so patch releases use the Cube version plus a build
metadata suffix at most.

## [1.8.25] — 2026-11-15

First release.

- Prometheus metrics from Cube's `CreateOptions.logger` hook: request rate, latency
  percentiles, errors, in-flight requests, cache outcomes, queue wait, pre-aggregation
  coverage and build time, data source query time, SQL generation time, build info.
- NDJSON log records in the pino/bunyan field convention with `trace_id`, matching the id
  Cube puts in the SQL comment sent to the warehouse.
- Drift detection: `cube_telemetry_unmapped_events_total` for event names outside the
  contract, and `tools/contract-check.mjs` to verify every assumption against a Cube
  checkout.
- Verified against `cubejs/cube:v1.8.25` end to end: metrics, logs and warehouse SQL all
  carry the same request id, and every alert/dashboard query runs through Grafana.
