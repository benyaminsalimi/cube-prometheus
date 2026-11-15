'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { create } = require('../src/index');
const { parseExposition, valueOf, seriesNames } = require('./helpers/scrape');

function makeExporter(options = {}) {
  return create({ port: 0, logs: 'none', env: {}, ...options });
}

async function scrape(exporter) {
  return exporter.render();
}

test('a successful load increments requests, duration and in-flight tracking', async () => {
  const exporter = makeExporter();
  exporter.logger('Load Request', { requestId: 'r1', apiType: 'rest' });
  exporter.logger('Load Request Success', { requestId: 'r1', apiType: 'rest', duration: 250 });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_requests_total', { api_type: 'rest', status: 'success' }), 1);
  assert.equal(valueOf(body, 'cube_request_duration_seconds_count', { api_type: 'rest' }), 1);
  assert.equal(valueOf(body, 'cube_request_duration_seconds_sum', { api_type: 'rest' }), 0.25);
  assert.equal(valueOf(body, 'cube_requests_in_flight', { api_type: 'rest' }), 0);
});

test('in-flight is one while a request is open and zero after it settles', async () => {
  const exporter = makeExporter();
  exporter.logger('Load Request', { requestId: 'r2', apiType: 'ws' });
  assert.equal(valueOf(await scrape(exporter), 'cube_requests_in_flight', { api_type: 'ws' }), 1);

  exporter.logger('Load Request Success', { requestId: 'r2', apiType: 'ws', duration: 10 });
  assert.equal(valueOf(await scrape(exporter), 'cube_requests_in_flight', { api_type: 'ws' }), 0);
});

test('a stale in-flight entry is swept instead of leaking', async () => {
  const exporter = makeExporter({ inFlightTtlMs: 1000 });
  const started = Date.now();
  exporter.tracker.start('stale', 'rest');
  assert.equal(exporter.tracker.active.size, 1);

  exporter.logger('Query completed', { duration: 1 });
  exporter.tracker.sweep(started + 5000);

  assert.equal(exporter.tracker.active.size, 0);
  assert.equal(valueOf(await scrape(exporter), 'cube_requests_in_flight', { api_type: 'rest' }), 0);
});

test('an error event counts a failed request, not a successful one', async () => {
  const exporter = makeExporter();
  exporter.logger('Load Request', { requestId: 'r3', apiType: 'rest' });
  exporter.logger('UserError', { requestId: 'r3', apiType: 'rest', duration: 5, error: 'nope' });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_requests_total', { api_type: 'rest', status: 'error' }), 1);
  assert.equal(valueOf(body, 'cube_requests_total', { api_type: 'rest', status: 'success' }), undefined);
});

test('database query duration is recorded separately from request duration', async () => {
  const exporter = makeExporter();
  exporter.logger('Query completed', { duration: 150, requestId: 'r4' });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_db_queries_total', { status: 'success' }), 1);
  assert.equal(valueOf(body, 'cube_db_query_duration_seconds_sum'), 0.15);
  assert.equal(valueOf(body, 'cube_request_duration_seconds_count'), undefined);
});

test('queue wait and pre-aggregation build time come from the same event', async () => {
  const exporter = makeExporter();
  exporter.logger('Performing query completed', {
    requestId: 'r5',
    timeInQueue: 100,
    duration: 2000,
    preAggregationId: 'orders.orders_by_day',
  });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_queue_wait_seconds_sum'), 0.1);
  assert.equal(valueOf(body, 'cube_preaggregation_builds_total', { status: 'success' }), 1);
  assert.equal(valueOf(body, 'cube_preaggregation_build_duration_seconds_sum'), 2);
});

test('a failed pre-aggregation build is labelled as an error', async () => {
  const exporter = makeExporter();
  exporter.logger('Error while querying', { requestId: 'r6', preAggregationId: 'x.y' });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_preaggregation_builds_total', { status: 'error' }), 1);
});

test('cache outcome counts one terminal event per lookup', async () => {
  const exporter = makeExporter();
  // Precursor events must not be counted, otherwise the hit ratio is inflated.
  exporter.logger('Found cache entry', { requestId: 'r7' });
  exporter.logger('Found in memory cache entry', { requestId: 'r7' });
  exporter.logger('Using cache for', { requestId: 'r7' });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_cache_requests_total', { outcome: 'hit' }), 1);
});

test('cache miss and bypass are distinguishable', async () => {
  const exporter = makeExporter();
  exporter.logger('Missing cache for', {});
  exporter.logger('Force no cache for', {});

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_cache_requests_total', { outcome: 'miss' }), 1);
  assert.equal(valueOf(body, 'cube_cache_requests_total', { outcome: 'bypass' }), 1);
});

test('pre-aggregation served counts requests that used at least one', async () => {
  const exporter = makeExporter();
  exporter.logger('Load Request Success', { apiType: 'rest', duration: 5, queriesWithPreAggregations: 2 });
  exporter.logger('Load Request Success', { apiType: 'rest', duration: 5, queriesWithPreAggregations: 0 });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_preaggregation_served_total'), 1);
});

test('SQL generation time is not mixed into request duration', async () => {
  const exporter = makeExporter();
  exporter.logger('Load Request SQL', { apiType: 'rest', duration: 40 });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_sql_generation_duration_seconds_sum'), 0.04);
  assert.equal(valueOf(body, 'cube_request_duration_seconds_count'), undefined);
});

test('an event without a duration is counted but not observed', async () => {
  const exporter = makeExporter();
  exporter.logger('Query started', { requestId: 'r8' });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_events_total', { event: 'Query started' }), 1);
  assert.equal(valueOf(body, 'cube_event_duration_seconds_count', { event: 'Query started' }), undefined);
});

test('an event outside the contract increments the drift counter', async () => {
  const exporter = makeExporter();
  exporter.logger('Totally New Event', { requestId: 'r9' });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_telemetry_unmapped_events_total', { event: 'Totally New Event' }), 1);
});

test('unknown api types collapse to a bounded label value', async () => {
  const exporter = makeExporter();
  exporter.logger('Load Request Success', { duration: 1 });
  exporter.logger('Load Request Success', { duration: 1, apiType: 'carrier-pigeon' });

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_requests_total', { api_type: 'unknown', status: 'success' }), 1);
  assert.equal(valueOf(body, 'cube_requests_total', { api_type: 'other', status: 'success' }), 1);
});

test('SQL-shaped label values are replaced, not published', async () => {
  const exporter = makeExporter();
  exporter.logger('Load Request Success select * from users', { duration: 1 });

  const body = await scrape(exporter);
  assert.ok(!body.includes('select * from users'), 'query text must not reach the exposition');
  assert.equal(valueOf(body, 'cube_telemetry_dropped_total', { reason: 'label' }), 1);
});

test('build info is published once with its labels', async () => {
  const exporter = makeExporter({ version: '1.2.3' });
  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_build_info', { version: '1.2.3', db_type: 'unknown', cache_driver: 'unknown' }), 1);
});

test('default runtime metrics are exposed under the same prefix', async () => {
  const exporter = makeExporter();
  const names = seriesNames(await scrape(exporter));
  assert.ok(names.includes('cube_process_resident_memory_bytes'));
  assert.ok(names.includes('cube_nodejs_heap_size_used_bytes'));
});

test('a throwing metrics path never escapes the logger', async () => {
  const exporter = makeExporter();
  const original = exporter.metrics.eventsTotal.inc;
  exporter.metrics.eventsTotal.inc = () => { throw new Error('boom'); };

  assert.doesNotThrow(() => exporter.logger('Load Request', { requestId: 'r10' }));
  exporter.metrics.eventsTotal.inc = original;

  const body = await scrape(exporter);
  assert.equal(valueOf(body, 'cube_telemetry_dropped_total', { reason: 'tap' }), 1);
});

test('exposition parses as valid Prometheus text', async () => {
  const exporter = makeExporter();
  exporter.logger('Load Request Success', { apiType: 'rest', duration: 3 });
  const samples = parseExposition(await scrape(exporter));
  assert.ok(samples.length > 5);
  for (const sample of samples) {
    assert.ok(Number.isFinite(sample.value), `${sample.name} has a numeric value`);
  }
});
