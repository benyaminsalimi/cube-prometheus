'use strict';

/**
 * The metric catalog is the single source of truth for every series this exporter
 * publishes. Nothing else in this repository may spell a metric name: dashboards,
 * alert rules, docs and tests are generated from or checked against this file.
 *
 * Names are relative (no prefix). The prefix is applied at registry creation time
 * and defaults to `cube`, matching the names Cube Cloud publishes.
 */

/** Base-unit buckets, in seconds. Wide enough for sub-ms cache hits and 2 minute warehouse queries. */
const SECOND_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120,
];

const METRICS = {
  eventsTotal: {
    name: 'events_total',
    type: 'counter',
    labelNames: ['event', 'api_type'],
    help: 'Cube logger events, labelled by event name and API type',
  },
  eventDuration: {
    name: 'event_duration_seconds',
    type: 'histogram',
    labelNames: ['event'],
    buckets: SECOND_BUCKETS,
    help: 'Duration Cube reported for an event, in seconds',
  },
  requestsTotal: {
    name: 'requests_total',
    type: 'counter',
    labelNames: ['api_type', 'status'],
    help: 'Data API requests by API type and outcome',
  },
  requestDuration: {
    name: 'request_duration_seconds',
    type: 'histogram',
    labelNames: ['api_type'],
    buckets: SECOND_BUCKETS,
    help: 'Load request duration reported by Cube, in seconds',
  },
  requestsInFlight: {
    name: 'requests_in_flight',
    type: 'gauge',
    labelNames: ['api_type'],
    help: 'Load requests currently in flight, tracked by request id',
  },
  dbQueriesTotal: {
    name: 'db_queries_total',
    type: 'counter',
    labelNames: ['status'],
    help: 'Queries issued to the data source by outcome',
  },
  dbQueryDuration: {
    name: 'db_query_duration_seconds',
    type: 'histogram',
    labelNames: [],
    buckets: SECOND_BUCKETS,
    help: 'Data source query duration reported by Cube, in seconds',
  },
  queueWait: {
    name: 'queue_wait_seconds',
    type: 'histogram',
    labelNames: [],
    buckets: SECOND_BUCKETS,
    help: 'Time a query spent waiting in the orchestrator queue',
  },
  cacheRequests: {
    name: 'cache_requests_total',
    type: 'counter',
    labelNames: ['outcome'],
    help: 'Cache lookups by outcome',
  },
  preaggregationServed: {
    name: 'preaggregation_served_total',
    type: 'counter',
    labelNames: [],
    help: 'Load requests served with at least one pre-aggregation',
  },
  preaggregationBuilds: {
    name: 'preaggregation_builds_total',
    type: 'counter',
    labelNames: ['status'],
    help: 'Pre-aggregation build executions by outcome',
  },
  preaggregationBuildDuration: {
    name: 'preaggregation_build_duration_seconds',
    type: 'histogram',
    labelNames: [],
    buckets: SECOND_BUCKETS,
    help: 'Pre-aggregation build execution duration in seconds',
  },
  sqlGenerationDuration: {
    name: 'sql_generation_duration_seconds',
    type: 'histogram',
    labelNames: [],
    buckets: SECOND_BUCKETS,
    help: 'Time Cube spent compiling the model and generating SQL',
  },
  buildInfo: {
    name: 'build_info',
    type: 'gauge',
    labelNames: ['version', 'db_type', 'cache_driver'],
    help: 'Constant 1, labelled with the exporter build identity',
  },
  dropped: {
    name: 'telemetry_dropped_total',
    type: 'counter',
    labelNames: ['reason'],
    help: 'Telemetry operations dropped, by reason',
  },
  unmappedEvents: {
    name: 'telemetry_unmapped_events_total',
    type: 'counter',
    labelNames: ['event'],
    help: 'Logger events outside the exporter contract (drift detector)',
  },
};

/** Runtime families created by prom-client's collectDefaultMetrics under the same prefix. */
const DEFAULT_METRIC_FAMILIES = [
  'process_cpu_seconds_total',
  'process_resident_memory_bytes',
  'process_heap_bytes',
  'nodejs_heap_size_used_bytes',
  'nodejs_heap_size_total_bytes',
  'nodejs_eventloop_lag_seconds',
  'nodejs_gc_duration_seconds',
];

function fullName(prefix, key) {
  const metric = METRICS[key];
  if (!metric) {
    throw new Error(`Unknown metric key: ${key}`);
  }
  return `${prefix}_${metric.name}`;
}

function metricNames(prefix) {
  const out = {};
  for (const key of Object.keys(METRICS)) {
    out[key] = fullName(prefix, key);
  }
  return out;
}

function allNames(prefix) {
  return [...Object.keys(METRICS).map((key) => fullName(prefix, key))];
}

module.exports = { METRICS, SECOND_BUCKETS, DEFAULT_METRIC_FAMILIES, fullName, metricNames, allNames };
