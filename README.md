# @cube_oss/cube-prometheus

Prometheus metrics and NDJSON logs for a self-hosted **Cube (OSS)** deployment, using
Cube's public `logger` config option.

Source of truth: [benyaminsalimi/cube-observability](https://github.com/benyaminsalimi/cube-observability)
(`packages/cube-prometheus`). This repository is a mirror for consumers of the npm package;
changes land in the monorepo and are published here with `git subtree push`.

```bash
npm install @cube_oss/cube-prometheus
```

```js
// cube.js
module.exports = require('@cube_oss/cube-prometheus').withMetrics({ ...yourConfig });
```

```bash
CUBE_METRICS_PORT=9464 node your-cube-server
curl -s localhost:9464/metrics | grep '^cube_requests_total'
```

- No Cube fork, no core patch, no code inside the serving path.
- Durations in seconds; no query text, SQL, tenant or request id in any label.
- Metrics: requests, latency, in-flight, cache outcomes, queue wait, pre-aggregation builds,
  database queries, SQL generation time, build info, and a drift counter for unknown events.
- Logs: one JSON object per line (pino/bunyan fields) with `trace_id`, which also appears in
  the SQL Cube sends to the warehouse.

## Options

| Option | Env | Default |
| --- | --- | --- |
| `enabled` | `CUBE_METRICS_ENABLED` | `true` |
| `port` | `CUBE_METRICS_PORT` | `9464` (`0` disables the listener) |
| `path` | `CUBE_METRICS_PATH` | `/metrics` |
| `host` | `CUBE_METRICS_HOST` | `0.0.0.0` |
| `prefix` | `CUBE_METRICS_PREFIX` | `cube` |
| `token` | `CUBE_METRICS_TOKEN` | none |
| `labels` | `CUBE_METRICS_LABELS` | `{}` |
| `logs` | `CUBE_METRICS_LOGS` | `json` (`json`, `passthrough`, `none`) |

Fine-grained use:

```js
const { create } = require('@cube_oss/cube-prometheus');
const exporter = create({ port: 0 });

const server = new CubejsServer({ ...config, logger: exporter.logger });
const { app } = await server.listen();
app.get('/metrics', exporter.handler);   // or exporter.listen(9464)
```

`withMetrics` merges, never replaces: every other config key passes through and your own
`logger`, if any, is chained after the tap.

## What it depends on in Cube

`CreateOptions.logger`, `cube.js` loading, the `<uuid>-span-N` request id format, and a set
of logger event names. All of them live in `src/contract.js` and are verified against a Cube
checkout by `make test-contract` in the repository root. When Cube renames an event, that
check fails — the metric contract does not silently rot.

Full metric reference: `docs/metrics.md` in the repository.
