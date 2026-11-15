'use strict';

const { version: PACKAGE_VERSION } = require('../package.json');
const { resolveOptions } = require('./config');
const { createRegistry, InFlightTracker } = require('./registry');
const { observeEvent } = require('./events');
const { createLogWriter } = require('./logs');
const { createMetricsServer } = require('./server');
const catalog = require('./catalog');
const contract = require('./contract');

/**
 * Builds an exporter: a logger to hand to Cube, a registry, an optional HTTP listener
 * and an Express-style handler.
 *
 * Nothing here throws into Cube's call path. Observability is not a serving requirement.
 */
function create(options = {}) {
  const resolved = resolveOptions(options, options.env || process.env);
  const env = options.env || process.env;
  const failures = [];

  function onError(error, context) {
    failures.push({ error, context });
    try {
      options.onError?.(error, context);
    } catch (e) {
      // A user error handler must not break the tap either.
    }
  }

  const { registry, metrics, names } = createRegistry({
    prefix: resolved.prefix,
    labels: resolved.labels,
    version: options.version || PACKAGE_VERSION,
    dbType: env.CUBEJS_DB_TYPE,
    cacheDriver: env.CUBEJS_CACHE_AND_QUEUE_DRIVER,
  });

  const tracker = new InFlightTracker({
    ttlMs: resolved.inFlightTtlMs,
    gauge: metrics.requestsInFlight,
    onSweep: (expired) => metrics.dropped.inc({ reason: 'in_flight_ttl' }, expired),
  });

  const writer = createLogWriter({
    mode: resolved.logs,
    passthrough: options.logger,
    env,
    onError: (error, context) => onError(error, { ...context, phase: 'logs' }),
  });

  function logger(event, params) {
    const properties = params && typeof params === 'object' ? params : {};
    try {
      observeEvent(event, properties, { metrics, tracker, onDrop: onError });
    } catch (error) {
      try {
        metrics.dropped.inc({ reason: 'tap' });
      } catch (e) {
        // ignore
      }
      onError(error, { phase: 'metrics', event: String(event) });
    }

    writer(event, properties);
  }

  const httpServer = createMetricsServer({
    registry,
    port: resolved.enabled ? resolved.port : 0,
    host: resolved.host,
    path: resolved.path,
    token: resolved.token,
    onError,
  });

  return {
    resolved,
    logger,
    registry,
    metrics,
    names,
    tracker,
    writer,
    failures,
    handler: httpServer.handler,
    start: () => httpServer.start(),
    close: () => httpServer.close(),
    listen: async (port) => {
      const server = httpServer.start(port);
      return { server, close: () => httpServer.close() };
    },
    attach(app) {
      if (app && typeof app.get === 'function') {
        app.get(resolved.path, httpServer.handler);
      }
    },
    render: () => registry.metrics(),
    contentType: registry.contentType,
    catalog,
    contract,
  };
}

/**
 * Config wrapper: the one-liner adoption path.
 *
 *   module.exports = withMetrics({ apiSecret: process.env.CUBEJS_API_SECRET });
 *
 * Returns a new config object with `logger` replaced by the tap, so every other Cube
 * setting passes through untouched. A user-supplied logger is preserved and chained.
 */
function withMetrics(config = {}, options = {}) {
  const resolved = resolveOptions(options, options.env || process.env);
  if (!resolved.enabled) {
    return { ...config };
  }

  const exporter = create({ ...options, logger: config.logger });
  exporter.start();

  return { ...config, logger: exporter.logger };
}

module.exports = { create, withMetrics, catalog, contract };
