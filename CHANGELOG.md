# Changelog

The version of this package mirrors the Cube release it is verified against:
`cube-prometheus@X.Y.Z` is tested against `cubejs/cube:vX.Y.Z`. There are no
independent minor or patch releases — a fix that must ship between Cube releases still
needs a Cube version to track, so patch releases use the Cube version plus a build
metadata suffix at most.

## [1.8.30] — 2026-11-20

- Tracks Cube v1.8.30.

## [1.8.28] — 2026-11-19

- Tracks Cube v1.8.28.

## [1.8.27] — 2026-11-17

- Tracks Cube v1.8.27.

## [1.8.26] — 2026-11-15

First published release. Tracks upstream Cube `v1.8.26`
(<https://github.com/cube-js/cube>).

- Prometheus metrics via Cube's public `logger` hook: request rate, latency percentiles,
  errors, in-flight requests, cache outcomes, queue wait, pre-aggregation coverage and
  build time, data source query time, SQL generation time, build info.
- NDJSON log records (pino/bunyan fields) carrying `trace_id` — the same id Cube puts in
  the SQL comment sent to the warehouse.
- Drift detection: `cube_telemetry_unmapped_events_total` plus `tools/contract-check.mjs`,
  which verifies every Cube assumption against the exact release this version claims.
- Contract verified against `cubejs/cube:v1.8.26`; no event changes between 1.8.25 and
  1.8.26.

## [1.8.25] — 2026-11-15

Tagged, never published; superseded by 1.8.26.

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
