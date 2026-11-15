import type { Registry } from 'prom-client';

export interface MetricsOptions {
  /** Turn the whole exporter off without removing the wrapper. Default: true */
  enabled?: boolean;
  /** Prometheus name prefix. Default: 'cube' */
  prefix?: string;
  /** Listener port. Default: 9464. Use 0 to disable the listener. */
  port?: number;
  /** Listener host. Default: '0.0.0.0' */
  host?: string;
  /** Endpoint path. Default: '/metrics' */
  path?: string;
  /** Optional bearer token required on the endpoint. */
  token?: string | null;
  /** Static labels added to every series. */
  labels?: Record<string, string>;
  /** Log output: 'json' (NDJSON only), 'passthrough' (NDJSON + Cube's logger), 'none'. */
  logs?: 'json' | 'passthrough' | 'none';
  /** Downstream logger to chain, e.g. one you already had in your config. */
  logger?: (event: string, params: Record<string, any>) => void;
  /** Never throws: reports tap, render, listen and log failures. */
  onError?: (error: Error, context?: Record<string, any>) => void;
  /** Overrides the in-flight request TTL in milliseconds. */
  inFlightTtlMs?: number;
  /** Version reported by the build_info gauge. */
  version?: string;
  /** Env source, for tests. Default: process.env */
  env?: NodeJS.ProcessEnv;
}

export interface Exporter {
  logger: (event: string, params?: Record<string, any>) => void;
  registry: Registry;
  metrics: Record<string, any>;
  names: Record<string, string>;
  handler: (req: any, res: any) => void;
  start: () => any;
  close: () => Promise<void>;
  listen: (port?: number) => Promise<{ server: any; close: () => Promise<void> }>;
  attach: (app: { get: (path: string, handler: any) => any }) => void;
  render: () => Promise<string>;
  contentType: string;
}

export function create(options?: MetricsOptions): Exporter;
export function withMetrics<T extends object>(config: T, options?: MetricsOptions): T;
export const catalog: {
  METRICS: Record<string, { name: string; type: string; labelNames: string[]; help: string }>;
  metricNames: (prefix: string) => Record<string, string>;
  allNames: (prefix: string) => string[];
};
export const contract: Record<string, any>;
