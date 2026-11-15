'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRecord, traceId, levelFor, createLogWriter, LEVELS } = require('../src/logs');

test('a record is one JSON object with pino fields', () => {
  const { record } = buildRecord('Load Request Success', { duration: 12, apiType: 'rest' });
  assert.equal(record.msg, 'Load Request Success');
  assert.equal(record.level, LEVELS.info);
  assert.equal(record.duration, 12);
  assert.equal(record.apiType, 'rest');
  assert.match(record.time, /^\d{4}-\d{2}-\d{2}T/);
});

test('event families map to levels', () => {
  assert.equal(levelFor('Internal Server Error'), LEVELS.error);
  assert.equal(levelFor('Orchestrator error'), LEVELS.error);
  assert.equal(levelFor('Continue wait'), LEVELS.warn);
  assert.equal(levelFor('Slow Query Warning'), LEVELS.warn);
  assert.equal(levelFor('Refresh Scheduler Error'), LEVELS.error);
  assert.equal(levelFor('Load Request Success'), LEVELS.info);
});

test('trace_id is the request id without the span suffix', () => {
  assert.equal(traceId('3fa85f64-5717-4562-b3fc-2c963f66afa6-span-1'), '3fa85f64-5717-4562-b3fc-2c963f66afa6');
  assert.equal(traceId('3fa85f64-5717-4562-b3fc-2c963f66afa6'), '3fa85f64-5717-4562-b3fc-2c963f66afa6');
  assert.equal(traceId(''), undefined);
  assert.equal(traceId(undefined), undefined);
});

test('trace_id is absent rather than invented for scheduler events', () => {
  const { record } = buildRecord('Refresh Scheduler Run', {});
  assert.ok(!('trace_id' in record));
});

test('query and params never reach the record', () => {
  const secretQuery = { measures: ['orders.count'] };
  const { record } = buildRecord('Load Request Success', {
    query: secretQuery,
    params: ['p@ssw0rd'],
    duration: 3,
  });
  assert.ok(!('query' in record));
  assert.ok(!('params' in record));
  assert.ok(!JSON.stringify(record).includes('p@ssw0rd'));
});

test('unserialisable payloads produce a record instead of throwing', () => {
  const circular = {};
  circular.self = circular;
  assert.doesNotThrow(() => buildRecord('Load Request Success', { duration: 1, warning: circular }));
  const { record } = buildRecord('Load Request Success', { duration: 1, warning: circular });
  assert.equal(typeof record.warning, 'string');
});

test('the writer filters below the configured threshold', () => {
  const lines = [];
  const writer = createLogWriter({
    mode: 'json',
    threshold: LEVELS.error,
    write: (line) => lines.push(line),
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });

  writer('Load Request Success', { duration: 1 });
  writer('Internal Server Error', { error: 'boom' });

  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).msg, 'Internal Server Error');
});

test('mode none writes nothing to stdout', () => {
  const lines = [];
  const writer = createLogWriter({ mode: 'none', write: (line) => lines.push(line), env: {} });
  writer('Load Request Success', { duration: 1 });
  assert.equal(lines.length, 0);
});

test('a downstream logger is chained and its failures are contained', () => {
  const seen = [];
  const writer = createLogWriter({
    mode: 'json',
    write: () => {},
    passthrough: (event) => {
      seen.push(event);
      if (event === 'Boom') throw new Error('downstream failed');
    },
    env: {},
  });

  assert.doesNotThrow(() => writer('Load Request Success', {}));
  assert.doesNotThrow(() => writer('Boom', {}));
  assert.deepEqual(seen, ['Load Request Success', 'Boom']);
});

test('a failing sink does not escape the writer', () => {
  const writer = createLogWriter({
    mode: 'json',
    write: () => { throw new Error('EPIPE'); },
    writeError: () => {},
    env: {},
  });
  assert.doesNotThrow(() => writer('Load Request Success', {}));
});
