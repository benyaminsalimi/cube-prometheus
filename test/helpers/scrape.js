'use strict';

/**
 * Minimal Prometheus text exposition parser, used by tests and by the contract check.
 * It understands the subset prom-client emits: counters, gauges, histogram buckets,
 * `_sum`/`_count`, and escaped label values.
 */

function parseLabels(raw) {
  const labels = {};
  if (!raw) return labels;
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = pattern.exec(raw))) {
    labels[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return labels;
}

function parseExposition(body) {
  const samples = [];
  for (const line of String(body).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})?\s+(-?[0-9.eE+]+)$/.exec(trimmed);
    if (!match) continue;
    samples.push({
      name: match[1],
      labels: parseLabels(match[2]),
      value: Number(match[3]),
    });
  }
  return samples;
}

function seriesNames(body) {
  return [...new Set(parseExposition(body).map((sample) => sample.name))].sort();
}

function findSamples(body, name, labels = {}) {
  return parseExposition(body).filter((sample) => {
    if (sample.name !== name) return false;
    return Object.entries(labels).every(([key, value]) => sample.labels[key] === String(value));
  });
}

function valueOf(body, name, labels = {}) {
  const found = findSamples(body, name, labels);
  if (!found.length) return undefined;
  return found.reduce((sum, sample) => sum + sample.value, 0);
}

module.exports = { parseExposition, seriesNames, findSamples, valueOf };
