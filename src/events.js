'use strict';

const { EVENT_NAMES, CACHE_OUTCOMES, knownEventNames } = require('./contract');
const { guardLabelValue, normalizeApiType } = require('./registry');

const START = new Set(EVENT_NAMES.requestStarted);
const SUCCESS = new Set(EVENT_NAMES.requestSucceeded);
const FAILED = new Set(EVENT_NAMES.requestFailed);
const CONTINUED = new Set(EVENT_NAMES.requestContinued);
const DB_SUCCESS = new Set(EVENT_NAMES.dbSucceeded);
const DB_FAILED = new Set(EVENT_NAMES.dbFailed);
const QUEUE_COMPLETED = new Set(EVENT_NAMES.queueCompleted);
const QUEUE_FAILED = new Set(EVENT_NAMES.queueFailed);
const SQL_GENERATED = new Set(EVENT_NAMES.sqlGenerated);
const KNOWN = knownEventNames();

/** Cube reports milliseconds everywhere; Prometheus base unit is seconds. */
function toSeconds(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value / 1000;
}

function observe(histogram, labels, seconds) {
  if (seconds === null) return;
  histogram.observe(labels, seconds);
}

function isPreAggregation(params) {
  return Boolean(params && (params.preAggregationId || params.preAggregation));
}

/**
 * Applies one Cube logger event to the metric bundle.
 * Returns the list of facts it recognised, which the tests assert on.
 */
function observeEvent(event, params = {}, context) {
  const { metrics, tracker, onDrop, now = Date.now() } = context;
  const name = String(event);
  const apiType = normalizeApiType(params.apiType);
  const recognised = [];

  const guarded = guardLabelValue(name);
  if (guarded.guarded) {
    metrics.dropped.inc({ reason: 'label' });
  }

  metrics.eventsTotal.inc({ event: guarded.value, api_type: apiType });
  observe(metrics.eventDuration, { event: guarded.value }, toSeconds(params.duration));

  if (START.has(name)) {
    tracker.start(params.requestId, apiType);
    recognised.push('request.started');
  }

  if (SUCCESS.has(name)) {
    metrics.requestsTotal.inc({ api_type: apiType, status: 'success' });
    observe(metrics.requestDuration, { api_type: apiType }, toSeconds(params.duration));
    if (typeof params.queriesWithPreAggregations === 'number' && params.queriesWithPreAggregations > 0) {
      metrics.preaggregationServed.inc();
      recognised.push('preaggregation.served');
    }
    tracker.settle(params.requestId, apiType);
    recognised.push('request.succeeded');
  }

  if (FAILED.has(name)) {
    metrics.requestsTotal.inc({ api_type: apiType, status: 'error' });
    tracker.settle(params.requestId, apiType);
    recognised.push('request.failed');
  }

  if (CONTINUED.has(name)) {
    recognised.push('request.continued');
  }

  if (DB_SUCCESS.has(name)) {
    metrics.dbQueriesTotal.inc({ status: 'success' });
    observe(metrics.dbQueryDuration, {}, toSeconds(params.duration));
    recognised.push('db.succeeded');
  }

  if (DB_FAILED.has(name)) {
    metrics.dbQueriesTotal.inc({ status: 'error' });
    recognised.push('db.failed');
  }

  if (QUEUE_COMPLETED.has(name)) {
    observe(metrics.queueWait, {}, toSeconds(params.timeInQueue));
    if (isPreAggregation(params)) {
      metrics.preaggregationBuilds.inc({ status: 'success' });
      observe(metrics.preaggregationBuildDuration, {}, toSeconds(params.duration));
      recognised.push('preaggregation.build.succeeded');
    }
    recognised.push('queue.completed');
  }

  if (QUEUE_FAILED.has(name) && isPreAggregation(params)) {
    metrics.preaggregationBuilds.inc({ status: 'error' });
    recognised.push('preaggregation.build.failed');
  }

  if (SQL_GENERATED.has(name)) {
    observe(metrics.sqlGenerationDuration, {}, toSeconds(params.duration));
    recognised.push('sql.generated');
  }

  if (Object.prototype.hasOwnProperty.call(CACHE_OUTCOMES, name)) {
    metrics.cacheRequests.inc({ outcome: CACHE_OUTCOMES[name] });
    recognised.push(`cache.${CACHE_OUTCOMES[name]}`);
  }

  if (!KNOWN.has(name)) {
    metrics.unmappedEvents.inc({ event: guarded.value });
    recognised.push('unmapped');
    onDrop?.(new Error(`Unmapped Cube event: ${name}`), { event: name });
  }

  tracker.sweep(now);

  return recognised;
}

module.exports = { observeEvent, toSeconds, isPreAggregation };
