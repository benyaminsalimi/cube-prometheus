'use strict';

const http = require('http');

/**
 * Serves the registry on its own listener.
 *
 * Cube exposes no route hook on the API port, and the metrics endpoint should not be a
 * routing decision on the serving path anyway: its exposure stays a separate choice.
 *
 * The request handler is always available (so tests and embedders can mount it), while
 * the listener only starts when a positive port is configured.
 */
function createMetricsServer({ registry, port, host = '0.0.0.0', path = '/metrics', token = null, onError } = {}) {
  let server = null;

  function authorized(req) {
    if (!token) return true;
    const header = req.headers.authorization || '';
    const [scheme, value] = header.split(' ');
    return /^Bearer$/i.test(scheme || '') && value === token;
  }

  async function handle(req, res) {
    const requestPath = (req.url || '').split('?')[0];
    if (requestPath !== path) {
      res.statusCode = 404;
      res.end();
      return;
    }
    if (!authorized(req)) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.end();
      return;
    }
    try {
      const body = await registry.metrics();
      res.statusCode = 200;
      res.setHeader('Content-Type', registry.contentType);
      res.end(body);
    } catch (error) {
      onError?.(error, { phase: 'render' });
      res.statusCode = 500;
      res.end();
    }
  }

  const handler = (req, res) => handle(req, res);

  return {
    enabled: Boolean(port),
    handler,
    start() {
      if (!port) return null;
      if (server) return server;
      server = http.createServer(handler);
      server.on('error', (error) => {
        onError?.(error, { phase: 'listen' });
        server = null;
      });
      server.listen(port, host);
      // A metrics listener must never be the reason a process stays alive.
      server.unref?.();
      return server;
    },
    async close() {
      if (!server) return;
      const closing = server;
      server = null;
      await new Promise((resolve) => closing.close(resolve));
    },
  };
}

module.exports = { createMetricsServer };
