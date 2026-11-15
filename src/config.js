'use strict';

/**
 * Configuration is resolved once, from one place. Every default lives in DEFAULTS,
 * every env var name lives in ENV, and no other module may read process.env for
 * exporter settings.
 */

const DEFAULTS = {
  enabled: true,
  prefix: 'cube',
  port: 9464,
  host: '0.0.0.0',
  path: '/metrics',
  token: null,
  labels: {},
  /**
   * Log output mode:
   *   json        - this exporter writes NDJSON and replaces Cube's default logger
   *   passthrough - NDJSON plus Cube's own logger (pretty in dev, JSON in prod)
   *   none        - metrics only, Cube's logger untouched
   */
  logs: 'json',
  /** Stop tracking an in-flight request after this long, so a dropped client cannot leak memory. */
  inFlightTtlMs: 15 * 60 * 1000,
};

const ENV = {
  enabled: 'CUBE_METRICS_ENABLED',
  prefix: 'CUBE_METRICS_PREFIX',
  port: 'CUBE_METRICS_PORT',
  host: 'CUBE_METRICS_HOST',
  path: 'CUBE_METRICS_PATH',
  token: 'CUBE_METRICS_TOKEN',
  labels: 'CUBE_METRICS_LABELS',
  logs: 'CUBE_METRICS_LOGS',
};

const LOG_MODES = ['json', 'passthrough', 'none'];

function readBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readInt(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${value}`);
  }
  return parsed;
}

function readLabels(value) {
  if (!value) return {};
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (e) {
    throw new Error(`${ENV.labels} must be a JSON object, got: ${value}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${ENV.labels} must be a JSON object`);
  }
  const out = {};
  for (const [key, raw] of Object.entries(parsed)) {
    out[String(key)] = String(raw);
  }
  return out;
}

function readLogMode(value) {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!LOG_MODES.includes(normalized)) {
    throw new Error(`${ENV.logs} must be one of ${LOG_MODES.join(', ')}, got: ${value}`);
  }
  return normalized;
}

/**
 * Resolve options from explicit arguments, then env, then defaults.
 * Throws only for values that cannot be interpreted; never for a missing value.
 */
function resolveOptions(options = {}, env = process.env) {
  const merged = { ...DEFAULTS };

  if (env[ENV.enabled] !== undefined) merged.enabled = readBool(env[ENV.enabled], merged.enabled);
  if (env[ENV.prefix]) merged.prefix = String(env[ENV.prefix]);
  if (env[ENV.port] !== undefined) merged.port = readInt(env[ENV.port], merged.port, ENV.port);
  if (env[ENV.host]) merged.host = String(env[ENV.host]);
  if (env[ENV.path]) merged.path = String(env[ENV.path]);
  if (env[ENV.token]) merged.token = String(env[ENV.token]);
  if (env[ENV.labels]) merged.labels = readLabels(env[ENV.labels]);
  const envLogMode = readLogMode(env[ENV.logs]);
  if (envLogMode) merged.logs = envLogMode;

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    merged[key] = value;
  }

  if (typeof merged.port !== 'number' || !Number.isInteger(merged.port) || merged.port < 0) {
    throw new Error(`port must be a non-negative integer, got: ${merged.port}`);
  }
  if (!merged.path.startsWith('/')) {
    throw new Error(`path must start with "/", got: ${merged.path}`);
  }
  if (!LOG_MODES.includes(merged.logs)) {
    throw new Error(`logs must be one of ${LOG_MODES.join(', ')}, got: ${merged.logs}`);
  }
  if (!merged.prefix || !/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(merged.prefix)) {
    throw new Error(`prefix must be a valid Prometheus name prefix, got: ${merged.prefix}`);
  }

  return merged;
}

module.exports = { DEFAULTS, ENV, LOG_MODES, resolveOptions };
