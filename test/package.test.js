'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { create, withMetrics } = require('../src/index');
const { resolveOptions } = require('../src/config');

test('withMetrics preserves every existing config key', () => {
  const config = {
    apiSecret: 'secret',
    schemaPath: 'model',
    dbType: 'postgres',
    cacheAndQueueDriver: 'cubestore',
  };

  const wrapped = withMetrics(config, { port: 0, logs: 'none', env: {} });

  assert.equal(wrapped.apiSecret, config.apiSecret);
  assert.equal(wrapped.schemaPath, config.schemaPath);
  assert.equal(wrapped.dbType, config.dbType);
  assert.equal(wrapped.cacheAndQueueDriver, config.cacheAndQueueDriver);
  assert.equal(typeof wrapped.logger, 'function');
});

test('withMetrics does not inject keys Cube would reject', () => {
  const wrapped = withMetrics({}, { port: 0, logs: 'none', env: {} });
  assert.deepEqual(Object.keys(wrapped), ['logger']);
});

test('an existing logger is chained rather than replaced', () => {
  const seen = [];
  const wrapped = withMetrics(
    { logger: (event) => seen.push(event) },
    { port: 0, logs: 'none', env: {} }
  );

  wrapped.logger('Load Request Success', { duration: 1 });
  assert.deepEqual(seen, ['Load Request Success']);
});

test('disabling returns the config untouched', () => {
  const config = { apiSecret: 'x', logger: 'keep-me' };
  const wrapped = withMetrics(config, { enabled: false, env: {} });
  assert.deepEqual(wrapped, config);
});

test('the env switch disables the exporter', () => {
  const wrapped = withMetrics({ apiSecret: 'x' }, { env: { CUBE_METRICS_ENABLED: 'false' } });
  assert.equal(wrapped.logger, undefined);
});

test('exporter exposes the catalog and contract it was built from', () => {
  const exporter = create({ port: 0, logs: 'none', env: {} });
  assert.equal(exporter.catalog.METRICS.requestsTotal.name, 'requests_total');
  assert.ok(exporter.contract.EVENT_NAMES.requestSucceeded.includes('Load Request Success'));
  assert.equal(exporter.names.requestsTotal, 'cube_requests_total');
});

test('prefix and labels are applied to every series', async () => {
  const exporter = create({ port: 0, logs: 'none', prefix: 'cubejs', labels: { deployment: 'prod' }, env: {} });
  exporter.logger('Load Request Success', { apiType: 'rest', duration: 1 });

  const body = await exporter.render();
  assert.match(body, /cubejs_requests_total\{[^}]*deployment="prod"/);
  assert.match(body, /cubejs_build_info\{[^}]*deployment="prod"/);
});

test('db type and cache driver are reported by build_info', async () => {
  const exporter = create({
    port: 0,
    logs: 'none',
    env: { CUBEJS_DB_TYPE: 'postgres', CUBEJS_CACHE_AND_QUEUE_DRIVER: 'cubestore' },
  });
  const body = await exporter.render();
  assert.match(body, /db_type="postgres"/);
  assert.match(body, /cache_driver="cubestore"/);
});

test('resolveOptions is callable without arguments', () => {
  const options = resolveOptions();
  assert.equal(typeof options.port, 'number');
});
