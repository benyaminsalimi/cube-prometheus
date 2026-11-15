'use strict';

const { EVENT_NAMES, LOG_ONLY_EVENTS } = require('./contract');

/**
 * Log records use the pino/bunyan field convention (numeric level, ISO time, msg) so
 * existing collectors, Loki pipelines and `pino` itself consume them unchanged.
 *
 * This writer is the log output for a self-hosted Cube: it replaces the default logger
 * rather than formatting on top of it. Set CUBE_METRICS_LOGS=passthrough to keep Cube's
 * own logger as well.
 *
 * Event names are never spelled here; they come from contract.js so a Cube rename fails
 * the contract check instead of silently changing a log level.
 */

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

const ERROR_EVENTS = new Set([
  ...EVENT_NAMES.requestFailed,
  ...EVENT_NAMES.schedulerFailed,
  ...EVENT_NAMES.preaggregationBuildFailed,
  ...LOG_ONLY_EVENTS.error,
]);

const WARN_EVENTS = new Set([...EVENT_NAMES.requestContinued, ...LOG_ONLY_EVENTS.warn]);

/**
 * Fields carried from Cube's params into the record. `query` and `params` are absent on
 * purpose: they hold SQL and bound values, and this file is the last line of defence
 * before stdout.
 */
const FIELDS = [
  'apiType',
  'appName',
  'duration',
  'error',
  'isPlayground',
  'protocol',
  'queries',
  'queriesWithPreAggregations',
  'queryType',
  'requestId',
  'status',
  'warning',
];

const LEVEL_NAMES = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };

/** Cube's request id is `<uuid>-span-<n>`; the trace id is everything before the suffix. */
function traceId(requestId) {
  if (typeof requestId !== 'string' || requestId === '') return undefined;
  const marker = '-span-';
  const index = requestId.lastIndexOf(marker);
  return index === -1 ? requestId : requestId.slice(0, index);
}

function levelFor(event) {
  const name = String(event);
  if (ERROR_EVENTS.has(name)) return LEVELS.error;
  if (WARN_EVENTS.has(name) || /Error$/.test(name)) return LEVELS.warn;
  return LEVELS.info;
}

function safeValue(value) {
  if (value === null || value === undefined) return undefined;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  try {
    JSON.stringify(value);
    return value;
  } catch (e) {
    return String(value);
  }
}

function thresholdFromEnv(env = process.env) {
  const configured = LEVELS[String(env.CUBEJS_LOG_LEVEL || 'info').toLowerCase()];
  return typeof configured === 'number' ? configured : LEVELS.info;
}

function buildRecord(event, params = {}, { threshold = LEVELS.info, now = () => new Date() } = {}) {
  const level = levelFor(event);
  const record = {
    level,
    time: now().toISOString(),
    msg: String(event),
  };

  const trace = traceId(params.requestId);
  if (trace !== undefined) record.trace_id = trace;

  for (const key of FIELDS) {
    const value = safeValue(params[key]);
    if (value !== undefined) record[key] = value;
  }

  return { record, level, threshold };
}

/**
 * Cube's own logger, resolved lazily.
 *
 * It lives in the Cube image, so it is resolvable at runtime and not a dependency of
 * this package. If it cannot be resolved (a stripped image, a strict install), the
 * caller gets null and nothing is lost but the formatting.
 */
function resolveCubeLogger(env = process.env) {
  try {
    // eslint-disable-next-line global-require
    const serverCore = require('@cubejs-backend/server-core');
    if (typeof serverCore.createLogger !== 'function') return null;
    const production = String(env.CUBEJS_DEV_MODE || '').toLowerCase() !== 'true';
    return serverCore.createLogger(production, env.CUBEJS_LOG_LEVEL || 'info');
  } catch (e) {
    return null;
  }
}

/**
 * @param {object} options
 * @param {'json'|'passthrough'|'none'} options.mode
 * @param {Function} [options.passthrough]  logger to call in addition to (or instead of) NDJSON
 * @param {Function} [options.write]        sink for NDJSON, defaults to process.stdout
 * @param {Function} [options.writeError]   sink for internal failures, defaults to stderr
 * @param {Function} [options.onError]      called once per failure; never throws
 */
function createLogWriter(options = {}) {
  const mode = options.mode || 'json';
  const write = options.write || ((line) => process.stdout.write(line));
  const writeError = options.writeError || ((line) => process.stderr.write(line));
  const onError = options.onError || (() => {});
  const threshold = options.threshold === undefined ? thresholdFromEnv(options.env) : options.threshold;
  const now = options.now || (() => new Date());

  const passthrough = options.passthrough
    || (mode === 'passthrough' ? resolveCubeLogger(options.env) : null);

  function report(message, error) {
    try {
      writeError(`${JSON.stringify({
        level: LEVELS.error,
        time: now().toISOString(),
        msg: message,
        error: String((error && error.message) || error),
      })}\n`);
    } catch (e) {
      // Nothing left that cannot fail.
    }
  }

  function writer(event, params) {
    if (mode !== 'none') {
      try {
        const { record } = buildRecord(event, params, { threshold, now });
        if (record.level >= threshold) write(`${JSON.stringify(record)}\n`);
      } catch (error) {
        report('log record failed', error);
        onError(error, { event });
      }
    }

    if (passthrough) {
      try {
        passthrough(event, params);
      } catch (error) {
        report('downstream logger failed', error);
        onError(error, { event });
      }
    }
  }

  writer.mode = mode;
  writer.threshold = threshold;
  writer.hasPassthrough = Boolean(passthrough);

  return writer;
}

module.exports = {
  LEVELS,
  LEVEL_NAMES,
  ERROR_EVENTS,
  WARN_EVENTS,
  FIELDS,
  traceId,
  levelFor,
  buildRecord,
  thresholdFromEnv,
  resolveCubeLogger,
  createLogWriter,
};
