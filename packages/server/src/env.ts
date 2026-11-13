// Environment configuration (self-hosting docs in README.md): every knob is an
// environment variable with a safe default. Values are validated at startup;
// every bad value prints one clear line and the process exits 1.

import * as fs from 'node:fs';

export interface EnvConfig {
  port: number;
  host: string;
  dataDir: string;
  clientDist: string;
  /** Max concurrent WebSocket connections (docs/PROTOCOL.md: 200). */
  maxConnections: number;
  /** Max concurrent WebSocket connections per client IP (docs/PROTOCOL.md: 10). */
  maxConnectionsPerIp: number;
  /**
   * Only for running behind a reverse proxy: when true, the client IP is taken
   * from the first X-Forwarded-For entry instead of the TCP socket.
   */
  trustProxy: boolean;
}

export const DEFAULT_PORT = 8080;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_MAX_CONNECTIONS = 200;
export const DEFAULT_MAX_CONNECTIONS_PER_IP = 10;

export interface EnvDefaults {
  dataDir: string;
  clientDist: string;
}

export type ParseResult =
  | { config: EnvConfig; errors: [] }
  | { config?: EnvConfig; errors: string[] };

/**
 * Parse and validate the environment. `errors` holds one human-readable line per
 * bad value; the caller prints them and exits. Never throws.
 */
export function parseEnv(env: NodeJS.ProcessEnv, defaults: EnvDefaults): ParseResult {
  const errors: string[] = [];

  const portRaw = env.PORT ?? '';
  let port = DEFAULT_PORT;
  if (portRaw !== '') {
    const n = Number(portRaw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      errors.push(`Invalid PORT ${JSON.stringify(portRaw)}: must be an integer between 1 and 65535.`);
    } else {
      port = n;
    }
  }

  const hostRaw = env.HOST ?? '';
  let host = DEFAULT_HOST;
  if (hostRaw !== '') {
    host = hostRaw;
  }

  const dataDirRaw = env.DATA_DIR ?? '';
  const dataDir = dataDirRaw !== '' ? dataDirRaw : defaults.dataDir;

  const clientDistRaw = env.CLIENT_DIST ?? '';
  const clientDist = clientDistRaw !== '' ? clientDistRaw : defaults.clientDist;

  const maxConnections = positiveInt(env, 'MAX_CONNECTIONS', DEFAULT_MAX_CONNECTIONS, errors);
  const maxConnectionsPerIp = positiveInt(env, 'MAX_CONNECTIONS_PER_IP', DEFAULT_MAX_CONNECTIONS_PER_IP, errors);

  const trustRaw = env.TRUST_PROXY ?? '';
  let trustProxy = false;
  if (trustRaw === '1') {
    trustProxy = true;
  } else if (trustRaw !== '' && trustRaw !== '0') {
    errors.push(`Invalid TRUST_PROXY ${JSON.stringify(trustRaw)}: use 1 (behind a reverse proxy) or 0 (default).`);
  }

  if (errors.length > 0) return { errors };
  return {
    config: { port, host, dataDir, clientDist, maxConnections, maxConnectionsPerIp, trustProxy },
    errors: [],
  };
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number, errors: string[]): number {
  const raw = env[name] ?? '';
  if (raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    errors.push(`Invalid ${name} ${JSON.stringify(raw)}: must be an integer of at least 1.`);
    return fallback;
  }
  return n;
}

/** True when `dir` exists and is a directory (the built client bundle). */
export function isClientDistReady(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Minimal shape of an incoming HTTP request, so tests can pass a plain object. */
export interface IpSource {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null } | null;
}

/**
 * Client IP for connection limits. With TRUST_PROXY=1 the first X-Forwarded-For
 * entry wins (that is what the reverse proxy saw); otherwise the TCP socket
 * address is used, which cannot be forged. Only enable TRUST_PROXY behind a
 * proxy you control: a direct client can send an arbitrary X-Forwarded-For.
 */
export function extractClientIp(req: IpSource, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
  }
  return req.socket?.remoteAddress ?? 'unknown';
}
