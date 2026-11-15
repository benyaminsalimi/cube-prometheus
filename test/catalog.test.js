'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { METRICS, allNames, fullName } = require('../src/catalog');

const GOLDEN = path.join(__dirname, 'golden', 'metric-names.txt');

/**
 * The name-lock test.
 *
 * Metric names are the contract with dashboards and alerts. Renaming one is a breaking
 * change, so it must be an explicit edit to the golden file in review, not a side effect
 * of a refactor.
 */
test('the published metric names match the golden lockfile', () => {
  const expected = fs.readFileSync(GOLDEN, 'utf8').trim().split('\n').sort();
  const actual = allNames('cube').sort();
  assert.deepEqual(actual, expected);
});

test('every metric carries help text and a type', () => {
  for (const [key, spec] of Object.entries(METRICS)) {
    assert.ok(spec.help && spec.help.length > 10, `${key} needs help text`);
    assert.ok(['counter', 'gauge', 'histogram'].includes(spec.type), `${key} has a known type`);
    assert.ok(Array.isArray(spec.labelNames), `${key} declares labelNames`);
  }
});

test('histograms declare base-unit buckets in seconds', () => {
  for (const [key, spec] of Object.entries(METRICS)) {
    if (spec.type !== 'histogram') continue;
    assert.ok(spec.buckets.length > 3, `${key} has buckets`);
    assert.ok(spec.buckets.every((b) => b > 0), `${key} buckets are positive`);
    const sorted = [...spec.buckets].sort((a, b) => a - b);
    assert.deepEqual(spec.buckets, sorted, `${key} buckets are sorted`);
  }
});

test('no metric name encodes milliseconds', () => {
  for (const name of allNames('cube')) {
    assert.ok(!name.endsWith('_ms'), `${name} must use seconds, not milliseconds`);
  }
});

test('label names avoid high-cardinality identifiers', () => {
  const forbidden = ['request_id', 'requestId', 'trace_id', 'query', 'sql', 'tenant', 'cacheKey', 'path'];
  for (const [key, spec] of Object.entries(METRICS)) {
    for (const label of spec.labelNames) {
      assert.ok(!forbidden.includes(label), `${key} must not label on ${label}`);
    }
  }
});

test('prefix is applied consistently', () => {
  assert.equal(fullName('cube', 'requestsTotal'), 'cube_requests_total');
  assert.equal(fullName('cubejs', 'requestsTotal'), 'cubejs_requests_total');
});
