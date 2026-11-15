'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

const { create } = require('../src/index');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the handler serves exposition with the right content type', async () => {
  const exporter = create({ port: 0, logs: 'none', env: {} });
  exporter.logger('Load Request Success', { apiType: 'rest', duration: 5 });

  const res = { statusCode: 0, headers: {}, end(body) { this.body = body; }, setHeader(k, v) { this.headers[k] = v; } };
  await exporter.handler({ url: '/metrics', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers['Content-Type']), /^text\/plain; version=0\.0\.4/);
  assert.match(String(res.body), /cube_requests_total/);
});

test('an unknown path is 404', async () => {
  const exporter = create({ port: 0, logs: 'none', env: {} });
  const res = { statusCode: 0, headers: {}, end() {}, setHeader(k, v) { this.headers[k] = v; } };
  await exporter.handler({ url: '/nope', headers: {} }, res);
  assert.equal(res.statusCode, 404);
});

test('a configured token is required', async () => {
  const exporter = create({ port: 0, logs: 'none', token: 's3cret', env: {} });

  const anonymous = { statusCode: 0, headers: {}, end() {}, setHeader() {} };
  await exporter.handler({ url: '/metrics', headers: {} }, anonymous);
  assert.equal(anonymous.statusCode, 401);

  const wrong = { statusCode: 0, headers: {}, end() {}, setHeader() {} };
  await exporter.handler({ url: '/metrics', headers: { authorization: 'Bearer nope' } }, wrong);
  assert.equal(wrong.statusCode, 401);

  const authorized = { statusCode: 0, headers: {}, end(body) { this.body = body; }, setHeader(k, v) { this.headers[k] = v; } };
  await exporter.handler({ url: '/metrics', headers: { authorization: 'Bearer s3cret' } }, authorized);
  assert.equal(authorized.statusCode, 200);
});

test('a real listener serves /metrics and 404s elsewhere', async () => {
  const port = await freePort();
  const exporter = create({ port, host: '127.0.0.1', logs: 'none', env: {} });
  exporter.start();
  try {
    const ok = await request(port, '/metrics');
    assert.equal(ok.status, 200);
    assert.match(ok.body, /cube_build_info/);

    const missing = await request(port, '/other');
    assert.equal(missing.status, 404);
  } finally {
    await exporter.close();
  }
});

test('a busy port is reported and does not throw', async () => {
  const port = await freePort();
  const first = create({ port, host: '127.0.0.1', logs: 'none', env: {} });
  first.start();

  const failures = [];
  const second = create({
    port,
    host: '127.0.0.1',
    logs: 'none',
    env: {},
    onError: (error, context) => failures.push(context && context.phase),
  });

  assert.doesNotThrow(() => second.start());
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.ok(failures.includes('listen'), `expected a listen failure, saw: ${failures.join(',')}`);
  await first.close();
  await second.close();
});

test('port 0 starts no listener', async () => {
  const exporter = create({ port: 0, logs: 'none', env: {} });
  assert.equal(exporter.start(), null);
});
