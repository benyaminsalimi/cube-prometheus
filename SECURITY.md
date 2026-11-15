# Security

## What this package collects

The exporter reads Cube's logger events and publishes **numbers only**. No query text, SQL,
bound parameter values, tenant identifiers or request ids are used as metric labels.

Log records are a different matter: they include a whitelisted field set (`apiType`,
`duration`, `error`, `queries`, `requestId`, …) and never `query` or `params`. `error`
fields can contain fragments of failed SQL, and Cube's own `CUBEJS_LOG_REDACTION` still
applies to everything Cube logs.

## The metrics endpoint

- Off the API port by design, so its exposure is a separate decision from the Cube API.
- Unauthenticated unless `CUBE_METRICS_TOKEN` is set; when set, scrapes need
  `Authorization: Bearer <token>`.
- Must not be exposed through an ingress. Scrape it from inside the cluster
  (PodMonitor/ServiceMonitor) and restrict it with a NetworkPolicy.

## Reporting a vulnerability

Report privately to **security@syrah.dev**. Please include the package version, the Cube
version, and a reproduction. Do not open a public issue for a vulnerability.

## Supported versions

Only the version matching a current Cube release is supported — see
[CHANGELOG.md](CHANGELOG.md).
