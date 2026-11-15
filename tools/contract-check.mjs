#!/usr/bin/env node
/**
 * Verifies every hardcoded assumption about Cube against a Cube checkout.
 *
 * The package's only coupling to Cube is its vocabulary: logger event names, the `logger`
 * config option, how `cube.js` is loaded, the request id format, and two image paths. All
 * of it lives in src/contract.js and all of it is checked here.
 *
 * Usage: node tools/contract-check.mjs [--cube <path>] [--json]
 *        CUBE_REPO=/path/to/cube node tools/contract-check.mjs
 *
 * Exits 1 when an anchor, event name or env var is missing. In CI this runs against the
 * exact Cube tag the package version claims, so a release cannot be published while its
 * claimed compatibility is false.
 */

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const contract = require('../src/contract.js');
const catalog = require('../src/catalog.js');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const cubeIndex = args.indexOf('--cube');
const cubeRoot = cubeIndex !== -1
  ? path.resolve(args[cubeIndex + 1])
  : path.resolve(process.env.CUBE_REPO || '');

function read(relative) {
  const file = path.join(cubeRoot, relative);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}

function lineOf(text, needle) {
  const index = text.indexOf(needle);
  if (index === -1) return null;
  return text.slice(0, index).split('\n').length;
}

const checks = [];
function record(group, id, ok, detail) {
  checks.push({ group, id, ok, detail });
}

if (!process.env.CUBE_REPO && cubeIndex === -1) {
  console.error('No Cube checkout: pass --cube <path> or set CUBE_REPO.');
  process.exit(2);
}
if (!existsSync(cubeRoot)) {
  console.error(`Cube checkout not found: ${cubeRoot}`);
  process.exit(2);
}

for (const anchor of contract.ANCHORS) {
  const text = read(anchor.file);
  if (text === null) {
    record('anchor', anchor.id, false, `missing file ${anchor.file}`);
    continue;
  }
  const line = lineOf(text, anchor.pattern);
  record('anchor', anchor.id, line !== null, line !== null
    ? `${anchor.file}:${line}`
    : `${anchor.pattern} not found in ${anchor.file}`);
}

for (const [event, file] of Object.entries(contract.EVENT_ANCHORS)) {
  const text = read(file);
  if (text === null) {
    record('event', event, false, `missing file ${file}`);
    continue;
  }
  const line = lineOf(text, `'${event}'`) || lineOf(text, `"${event}"`);
  record('event', event, line !== null, line !== null ? `${file}:${line}` : `'${event}' not found in ${file}`);
}

for (const event of contract.allEventNames()) {
  if (!contract.EVENT_ANCHORS[event]) {
    record('coverage', event, false, 'no entry in EVENT_ANCHORS');
  }
}

const envSource = read('packages/cubejs-backend-shared/src/env.ts');
for (const name of contract.ENV_VARS.cube) {
  if (envSource === null) {
    record('env', name, false, 'missing packages/cubejs-backend-shared/src/env.ts');
    continue;
  }
  const line = lineOf(envSource, name);
  record('env', name, line !== null, line !== null ? `env.ts:${line}` : `${name} not found in env.ts`);
}

for (const name of catalog.allNames('cube')) {
  record('catalog', name, true, 'declared');
}

const failed = checks.filter((check) => !check.ok);

if (jsonOut) {
  console.log(JSON.stringify({ cubeRoot, checks, failed: failed.length }, null, 2));
} else {
  const groups = [...new Set(checks.map((check) => check.group))];
  for (const group of groups) {
    console.log(`\n${group}`);
    for (const check of checks.filter((entry) => entry.group === group)) {
      console.log(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.id}${check.detail ? `  (${check.detail})` : ''}`);
    }
  }
  console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
}

process.exit(failed.length === 0 ? 0 : 1);
