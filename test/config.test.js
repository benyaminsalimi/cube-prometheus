'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveOptions, DEFAULTS, ENV } = require('../src/config');

test('defaults require no configuration', () => {
  const options = resolveOptions({}, {});
  assert.equal(options.port, DEFAULTS.port);
  assert.equal(options.path, '/metrics');
  assert.equal(options.prefix, 'cube');
  assert.equal(options.logs, 'json');
  assert.equal(options.enabled, true);
});

test('env vars override defaults', () => {
  const options = resolveOptions({}, {
    [ENV.port]: '9598',
    [ENV.prefix]: 'cubejs',
    [ENV.path]: '/internal/metrics',
    [ENV.labels]: '{"deployment":"prod"}',
    [ENV.logs]: 'passthrough',
    [ENV.enabled]: 'false',
  });
  assert.equal(options.port, 9598);
  assert.equal(options.prefix, 'cubejs');
  assert.equal(options.path, '/internal/metrics');
  assert.deepEqual(options.labels, { deployment: 'prod' });
  assert.equal(options.logs, 'passthrough');
  assert.equal(options.enabled, false);
});

test('explicit options win over env', () => {
  const options = resolveOptions({ port: 7000 }, { [ENV.port]: '9598' });
  assert.equal(options.port, 7000);
});

test('port 0 is accepted and disables the listener', () => {
  assert.equal(resolveOptions({ port: 0 }, {}).port, 0);
});

test('invalid port is rejected', () => {
  assert.throws(() => resolveOptions({}, { [ENV.port]: 'abc' }), /non-negative integer/);
  assert.throws(() => resolveOptions({ port: -1 }, {}), /non-negative integer/);
});

test('invalid log mode is rejected', () => {
  assert.throws(() => resolveOptions({}, { [ENV.logs]: 'pretty' }), /must be one of/);
});

test('invalid labels JSON is rejected', () => {
  assert.throws(() => resolveOptions({}, { [ENV.labels]: 'not-json' }), /JSON object/);
  assert.throws(() => resolveOptions({}, { [ENV.labels]: '[]' }), /JSON object/);
});

test('path must be absolute', () => {
  assert.throws(() => resolveOptions({ path: 'metrics' }, {}), /must start with/);
});

test('prefix must be a valid Prometheus name fragment', () => {
  assert.throws(() => resolveOptions({ prefix: 'my-prefix' }, {}), /valid Prometheus/);
});
