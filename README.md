# @cube_oss/cube-prometheus

Prometheus metrics and NDJSON logs for a self-hosted **Cube (OSS)** deployment, using
Cube's public `logger` config option.

This repository is the **source of truth** for the npm package. The umbrella repository
[benyaminsalimi/cube-observability](https://github.com/benyaminsalimi/cube-observability)
consumes it as a git submodule at `packages/cube-prometheus` and installs the published
tarball for its image builds.

## Versions

The npm version **mirrors the Cube release this package is verified against**: Cube
`v1.8.25` → `@cube_oss/cube-prometheus@1.8.25`. Pin the same number as your
`cubejs/cube` image tag (minus the `v`):

```bash
docker pull cubejs/cube:v1.8.25
npm install @cube_oss/cube-prometheus@1.8.25
```

There is no separate version line and no back-filling of older Cube releases — each
Cube upgrade publishes the matching package version. Releases are cut from this
repository by pushing a `v<version>` tag; the `publish` workflow refuses to run when
the tag and `package.json` disagree.

## Install

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

## Versioning

The package version mirrors the Cube release it is verified against:
`@cube_oss/cube-prometheus@1.8.25` is tested against `cubejs/cube:v1.8.25`. There are no
independent minor releases; publishing a fix means tracking the Cube version it targets.
The publish workflow enforces it: the git tag must equal `package.json`, the version must
be a real `cubejs/cube` tag, and the event-name contract must hold against that exact tag
before anything reaches the registry.

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
checkout by the umbrella repository's `make test-contract`. When Cube renames an event, that
check fails — the metric contract does not silently rot.

## Releasing

Tagging is the release:

```bash
npm version --no-git-tag-version 1.8.25   # or the Cube release you verified
git commit -am "release: 1.8.25"
git tag v1.8.25 && git push origin main --tags
```

`.github/workflows/publish.yml` then enforces, in order: unit tests, tag == `package.json`,
the version is a real `cubejs/cube` tag, the event-name contract holds against **that
exact tag**, the tarball packs, and the version is not already on the registry. Only then
does it publish with provenance and create the GitHub release.

Authentication is npm **trusted publishing** (OIDC) — no token and no 2FA prompt. Configure
it once in the npm package settings: Trusted Publisher → `benyaminsalimi/cube-prometheus`,
workflow `publish.yml`. If a granular `NPM_TOKEN` secret with "Bypass 2FA" is present, the
workflow uses it instead.

`detect-cube-release.yml` runs daily and opens a pull request when a newer Cube release
exists, so the only manual step is reviewing and merging it.

## Tests

```bash
npm install
npm test
```

## Publishing

```bash
npm publish --access public
```

Then bump the submodule pointer in `cube-observability`, which is the only place the
consumers read the package from.
