'use strict';

const client = require('prom-client');
const { METRICS, metricNames, fullName } = require('./catalog');

const MAX_LABEL_LENGTH = 96;
const DISALLOWED = /[^\x20-\x7E]/;
const SQL_LIKE = /\b(select|insert|update|delete|create|drop|alter)\b\s/i;
const JSON_LIKE = /^[{[].*[}\]]$/;

/**
 * Label values are the only place user-controlled data could reach Prometheus.
 * Event names, API types and outcomes are all code constants, so anything that does
 * not look like one is replaced rather than published. A value that fails the guard
 * is also counted, so a surprise shows up as `telemetry_dropped_total{reason="label"}`.
 */
function guardLabelValue(value) {
  if (value === undefined || value === null || value === '') return { value: 'unknown', guarded: false };
  const text = String(value);
  if (text.length > MAX_LABEL_LENGTH) return { value: 'truncated', guarded: true };
  if (DISALLOWED.test(text) || SQL_LIKE.test(text) || JSON_LIKE.test(text)) {
    return { value: 'invalid', guarded: true };
  }
  return { value: text, guarded: false };
}

function normalizeApiType(value) {
  const { value: text } = guardLabelValue(value);
  return ['rest', 'ws', 'graphql', 'sql'].includes(text) ? text : (text === 'unknown' ? 'unknown' : 'other');
}

function createMetrics(registry, prefix) {
  const bundle = {};
  for (const key of Object.keys(METRICS)) {
    const spec = METRICS[key];
    const options = {
      name: fullName(prefix, key),
      help: spec.help,
      labelNames: spec.labelNames,
      registers: [registry],
    };
    if (spec.buckets) options.buckets = spec.buckets;

    switch (spec.type) {
      case 'counter':
        bundle[key] = new client.Counter(options);
        break;
      case 'gauge':
        bundle[key] = new client.Gauge(options);
        break;
      case 'histogram':
        bundle[key] = new client.Histogram(options);
        break;
      default:
        throw new Error(`Unsupported metric type: ${spec.type}`);
    }
  }
  return bundle;
}

function createRegistry({ prefix, labels = {}, version = '0.0.0', dbType = 'unknown', cacheDriver = 'unknown' }) {
  const registry = new client.Registry();
  registry.setDefaultLabels({ ...labels });

  client.collectDefaultMetrics({ register: registry, prefix: `${prefix}_` });

  const metrics = createMetrics(registry, prefix);

  metrics.buildInfo.set(
    { version, db_type: dbType || 'unknown', cache_driver: cacheDriver || 'unknown' },
    1
  );

  return { registry, metrics, names: metricNames(prefix) };
}

/**
 * Tracks in-flight load requests by request id.
 *
 * Cube emits `Load Request` and exactly one terminal event per request, both carrying
 * the same requestId. Counting starts and terminals keeps the gauge exact without any
 * per-request labelling. A client that disappears never emits a terminal event, so
 * entries older than the TTL are swept instead of leaking.
 */
class InFlightTracker {
  constructor({ ttlMs, gauge, onSweep } = {}) {
    this.ttlMs = ttlMs;
    this.gauge = gauge;
    this.onSweep = onSweep || (() => {});
    this.active = new Map();
    this.counts = new Map();
  }

  start(requestId, apiType) {
    if (!requestId || this.active.has(requestId)) return;
    this.active.set(requestId, { apiType, at: Date.now() });
    const next = (this.counts.get(apiType) || 0) + 1;
    this.counts.set(apiType, next);
    this.render(apiType, next);
  }

  settle(requestId, apiType) {
    if (!requestId) return;
    const entry = this.active.get(requestId);
    const type = entry ? entry.apiType : apiType;
    if (!entry) return;
    this.active.delete(requestId);
    const next = Math.max(0, (this.counts.get(type) || 0) - 1);
    this.counts.set(type, next);
    this.render(type, next);
  }

  sweep(now = Date.now()) {
    if (!this.ttlMs) return 0;
    let expired = 0;
    for (const [requestId, entry] of this.active) {
      if (now - entry.at < this.ttlMs) continue;
      this.active.delete(requestId);
      const next = Math.max(0, (this.counts.get(entry.apiType) || 0) - 1);
      this.counts.set(entry.apiType, next);
      this.render(entry.apiType, next);
      expired += 1;
    }
    if (expired) this.onSweep(expired);
    return expired;
  }

  render(apiType, value) {
    if (!this.gauge) return;
    try {
      this.gauge.set({ api_type: guardLabelValue(apiType).value }, value);
    } catch (e) {
      // A gauge failure must never affect a request.
    }
  }
}

module.exports = {
  guardLabelValue,
  normalizeApiType,
  createRegistry,
  createMetrics,
  InFlightTracker,
  MAX_LABEL_LENGTH,
};
