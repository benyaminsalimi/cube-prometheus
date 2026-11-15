'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/**
 * Repository boundaries.
 *
 * This repository owns the exporter library and its release pipeline. Deployment
 * concerns — Helm chart, exporter image, end-to-end harness — live in
 * benyaminsalimi/cube-observability. If one of those appears here, the split has
 * drifted and one of the two repositories is now the wrong home for something.
 */
test('this repository contains only the package', () => {
  for (const directory of ['charts', 'e2e', 'images', 'model', 'deploy']) {
    assert.ok(
      !fs.existsSync(path.join(ROOT, directory)),
      `${directory}/ belongs to the deployment repository, not here`
    );
  }
});

test('the package does not claim to be official', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /Unofficial/, 'README must state that this is unofficial');
  assert.match(
    readme,
    /github\.com\/cube-js\/cube/,
    'README must point at upstream Cube'
  );
});

test('the package name carries no third-party scope', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'cube-prometheus');
  assert.ok(!manifest.name.startsWith('@cube'), 'must not use the upstream or Cube Dev scope');
});

test('the release pipeline is self-contained', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(manifest.scripts.contract, 'the contract check must run from this repository');
  assert.ok(
    fs.existsSync(path.join(ROOT, 'tools', 'contract-check.mjs')),
    'tools/contract-check.mjs must exist here'
  );
  for (const workflow of ['ci.yml', 'publish.yml', 'detect-cube-release.yml']) {
    assert.ok(
      fs.existsSync(path.join(ROOT, '.github', 'workflows', workflow)),
      `${workflow} must exist here`
    );
  }
});
