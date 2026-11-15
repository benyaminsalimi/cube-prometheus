'use strict';

/**
 * Every assumption this exporter makes about Cube itself lives here.
 *
 * `tools/contract-check.mjs` reads this file and verifies each entry against a Cube
 * checkout, so a new Cube release that renames an event, drops the `logger` option or
 * moves a path fails a check instead of silently zeroing a dashboard.
 *
 * Nothing outside this file may hardcode a Cube event name, env var or path.
 */

/** Event families the exporter derives semantics from. */
const EVENT_NAMES = {
  requestStarted: ['Load Request'],
  requestSucceeded: ['Load Request Success'],
  requestFailed: [
    'UserError',
    'Orchestrator error',
    'Internal Server Error',
    'Cube SQL Error',
    'Error querying db',
  ],
  requestContinued: ['Continue wait'],
  dbSucceeded: ['Query completed'],
  dbFailed: ['Error querying db'],
  queueCompleted: ['Performing query completed'],
  queueFailed: ['Error while querying'],
  sqlGenerated: ['Load Request SQL'],
  schedulerRun: ['Refresh Scheduler Run'],
  schedulerFailed: ['Refresh Scheduler Error'],
  preaggregationBuildStarted: ['Force build pre-aggregation'],
  preaggregationBuildFailed: ['Pre-aggregations build job error', 'Error loading pre-aggregation'],
};

/** Cache lookups mapped to a terminal outcome. Precursor events are deliberately not counted. */
const CACHE_OUTCOMES = {
  'Using cache for': 'hit',
  'Missing cache for': 'miss',
  'Force no cache for': 'bypass',
};

/**
 * Events used only for log level classification. They carry no metrics, but they are part
 * of the contract: a rename changes the level of a log line, which is what alert rules on
 * log-based pipelines consume.
 */
const LOG_ONLY_EVENTS = {
  error: [
    'Auth Error',
    'Dev Server Error',
    'Dev Server Fatal Error',
    'Orchestrator Release Error',
    'Queue storage error',
    'Streaming done with error',
    'User Error',
  ],
  warn: ['Slow Query Warning'],
};

/**
 * Events we observe but deliberately attach no semantics to. Anything outside this
 * list and EVENT_NAMES increments the drift counter instead of appearing in a panel.
 */
const BENIGN_EVENTS = [
  'Added to queue',
  'Auth Error',
  'Background fetch',
  'Building pre-aggregation',
  'Cancelling query due to timeout',
  'Creating pre-aggregation from scratch',
  'Error removing key',
  'Executing SQL',
  'Found cache entry',
  'Found in memory cache entry',
  'Incoming network usage',
  'Load PreAggregations Tables',
  'Outgoing network usage',
  'Performing query',
  'Query Rewrite completed',
  'Query started',
  'REST API Request',
  'Renewed',
  'Renewing existing key',
  'Requested renew',
  'Same request cache hit (background refresh)',
  'Slow Query Warning',
  'Waiting for query',
  'Waiting for renew',
];

/** Env vars read by this exporter or by Cube on its behalf. */
const ENV_VARS = {
  // Read by the exporter.
  ours: [
    'CUBE_METRICS_ENABLED',
    'CUBE_METRICS_PORT',
    'CUBE_METRICS_HOST',
    'CUBE_METRICS_PATH',
    'CUBE_METRICS_TOKEN',
    'CUBE_METRICS_PREFIX',
    'CUBE_METRICS_LABELS',
    'CUBE_METRICS_LOGS',
  ],
  // Read by Cube; listed so a rename is caught.
  cube: [
    'CUBEJS_LOG_LEVEL',
    'CUBEJS_LOG_REDACTION',
    'CUBEJS_DEV_MODE',
    'CUBEJS_DB_TYPE',
    'CUBEJS_CACHE_AND_QUEUE_DRIVER',
    'CUBEJS_SQL_INCLUDE_TRACE_ID',
    'CUBEJS_TELEMETRY',
  ],
};

/**
 * Point-in-source anchors. Each entry is verified by searching `file` for `pattern`
 * (plain substring unless `regex` is set).
 */
const ANCHORS = [
  {
    id: 'logger-option',
    what: 'CreateOptions.logger is a validated public field',
    file: 'packages/cubejs-server-core/src/core/optionsValidate.ts',
    pattern: 'logger: Joi.func()',
  },
  {
    id: 'logger-wrapping',
    what: 'Cube wraps the supplied logger with redaction before use',
    file: 'packages/cubejs-server-core/src/core/server.ts',
    pattern: 'withLogRedaction(logger)',
  },
  {
    id: 'config-loading',
    what: 'cube.js is loaded from the working directory as the default export',
    file: 'packages/cubejs-server/src/server/container.ts',
    pattern: "path.join(process.cwd(), 'cube.js')",
  },
  {
    id: 'request-id-span',
    what: 'request ids are <uuid>-span-<n>',
    file: 'packages/cubejs-backend-shared/src/request-id.ts',
    pattern: '-span-',
  },
  {
    id: 'trace-comment',
    what: 'the SQL trace comment carries the request UUID',
    file: 'packages/cubejs-base-driver/src/trace-comment.ts',
    pattern: '/* trace_id: ',
  },
  {
    id: 'image-node-path',
    what: 'the image resolves modules from /cube/conf/node_modules',
    file: 'packages/cubejs-docker/latest.Dockerfile',
    pattern: 'NODE_PATH=/cube/conf/node_modules:/cube/node_modules',
  },
  {
    id: 'image-config-dir',
    what: 'the image runs Cube from /cube/conf',
    file: 'packages/cubejs-docker/latest.Dockerfile',
    pattern: 'WORKDIR /cube/conf',
  },
];

/** Source file that must contain each event name. */
const EVENT_ANCHORS = {
  'Load Request': 'packages/cubejs-api-gateway/src/gateway.ts',
  'Load Request Success': 'packages/cubejs-api-gateway/src/gateway.ts',
  'Load Request SQL': 'packages/cubejs-api-gateway/src/gateway.ts',
  UserError: 'packages/cubejs-api-gateway/src/gateway.ts',
  'Orchestrator error': 'packages/cubejs-api-gateway/src/gateway.ts',
  'Internal Server Error': 'packages/cubejs-api-gateway/src/gateway.ts',
  'Cube SQL Error': 'packages/cubejs-backend-native/src/node_export.rs',
  'Continue wait': 'packages/cubejs-api-gateway/src/gateway.ts',
  'Query completed': 'packages/cubejs-server-core/src/core/OrchestratorApi.ts',
  'Error querying db': 'packages/cubejs-server-core/src/core/OrchestratorApi.ts',
  'Performing query completed': 'packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts',
  'Error while querying': 'packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts',
  'Using cache for': 'packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts',
  'Missing cache for': 'packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts',
  'Force no cache for': 'packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts',
  'Refresh Scheduler Run': 'packages/cubejs-server-core/src/core/RefreshScheduler.ts',
  'Refresh Scheduler Error': 'packages/cubejs-server-core/src/core/RefreshScheduler.ts',
  'Force build pre-aggregation': 'packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts',
  'Pre-aggregations build job error': 'packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts',
  'Error loading pre-aggregation': 'packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts',
  'Auth Error': 'packages/cubejs-api-gateway/src/sql-server.ts',
  'Dev Server Error': 'packages/cubejs-server-core/src/core/DevServer.ts',
  'Dev Server Fatal Error': 'packages/cubejs-server-core/src/core/server.ts',
  'Orchestrator Release Error': 'packages/cubejs-server-core/src/core/OrchestratorApi.ts',
  'Queue storage error': 'packages/cubejs-query-orchestrator/src/orchestrator/QueryQueue.ts',
  'Streaming done with error': 'packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts',
  'User Error': 'packages/cubejs-server-core/src/core/server.ts',
  'Slow Query Warning': 'packages/cubejs-server-core/src/core/OrchestratorApi.ts',
};

function allEventNames() {
  return [...new Set([
    ...[].concat(...Object.values(EVENT_NAMES)),
    ...LOG_ONLY_EVENTS.error,
    ...LOG_ONLY_EVENTS.warn,
  ])];
}

function knownEventNames() {
  return new Set([...allEventNames(), ...Object.keys(CACHE_OUTCOMES), ...BENIGN_EVENTS]);
}

module.exports = {
  EVENT_NAMES,
  LOG_ONLY_EVENTS,
  CACHE_OUTCOMES,
  BENIGN_EVENTS,
  ENV_VARS,
  ANCHORS,
  EVENT_ANCHORS,
  allEventNames,
  knownEventNames,
};
