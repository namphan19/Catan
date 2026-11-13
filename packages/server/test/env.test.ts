// Self-hosting env config (README.md): validation, TRUST_PROXY IP extraction,
// missing-client-dist check, and graceful-shutdown room persistence.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractClientIp,
  isClientDistReady,
  parseEnv,
  DEFAULT_HOST,
  DEFAULT_MAX_CONNECTIONS,
  DEFAULT_MAX_CONNECTIONS_PER_IP,
  DEFAULT_PORT,
} from '../src/env';
import { lanAddresses, listenUrls, startServer, type ServerHandle } from '../src/main';
import { startRoom } from './helpers';

describe('env validation', () => {
  it('returns the documented defaults for an empty environment', () => {
    const r = parseEnv({}, { dataDir: '/d', clientDist: '/c' });
    expect(r.errors).toEqual([]);
    expect(r.config).toEqual({
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
      dataDir: '/d',
      clientDist: '/c',
      maxConnections: DEFAULT_MAX_CONNECTIONS,
      maxConnectionsPerIp: DEFAULT_MAX_CONNECTIONS_PER_IP,
      trustProxy: false,
    });
  });

  it('accepts valid custom values', () => {
    const r = parseEnv(
      {
        PORT: '8097',
        HOST: '127.0.0.1',
        DATA_DIR: '/tmp/rooms',
        CLIENT_DIST: '/tmp/dist',
        MAX_CONNECTIONS: '50',
        MAX_CONNECTIONS_PER_IP: '3',
        TRUST_PROXY: '1',
      },
      { dataDir: '/d', clientDist: '/c' },
    );
    expect(r.errors).toEqual([]);
    expect(r.config?.port).toBe(8097);
    expect(r.config?.host).toBe('127.0.0.1');
    expect(r.config?.maxConnections).toBe(50);
    expect(r.config?.maxConnectionsPerIp).toBe(3);
    expect(r.config?.trustProxy).toBe(true);
  });

  it('rejects a non-numeric or out-of-range PORT with one clear line', () => {
    for (const bad of ['abc', '0', '70000', '-1', '80.5']) {
      const r = parseEnv({ PORT: bad }, { dataDir: '/d', clientDist: '/c' });
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toContain('PORT');
      expect(r.config).toBeUndefined();
    }
  });

  it('rejects non-integer connection limits', () => {
    const r = parseEnv({ MAX_CONNECTIONS: '0', MAX_CONNECTIONS_PER_IP: '-2' }, { dataDir: '/d', clientDist: '/c' });
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toContain('MAX_CONNECTIONS');
    expect(r.errors[1]).toContain('MAX_CONNECTIONS_PER_IP');
  });

  it('rejects TRUST_PROXY values other than 0/1 and ignores TRUST_PROXY=0', () => {
    const bad = parseEnv({ TRUST_PROXY: 'yes' }, { dataDir: '/d', clientDist: '/c' });
    expect(bad.errors).toHaveLength(1);
    expect(bad.errors[0]).toContain('TRUST_PROXY');
    const off = parseEnv({ TRUST_PROXY: '0' }, { dataDir: '/d', clientDist: '/c' });
    expect(off.errors).toEqual([]);
    expect(off.config?.trustProxy).toBe(false);
  });

  it('reports every bad value at once (one line each)', () => {
    const r = parseEnv(
      { PORT: 'x', MAX_CONNECTIONS: 'x', MAX_CONNECTIONS_PER_IP: 'x', TRUST_PROXY: 'x' },
      { dataDir: '/d', clientDist: '/c' },
    );
    expect(r.errors).toHaveLength(4);
  });
});

describe('TRUST_PROXY IP extraction', () => {
  it('uses the TCP socket address when the proxy is not trusted', () => {
    const req = { headers: { 'x-forwarded-for': '9.9.9.9' }, socket: { remoteAddress: '10.0.0.7' } };
    expect(extractClientIp(req, false)).toBe('10.0.0.7');
  });

  it('takes the first X-Forwarded-For entry when the proxy is trusted', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.7' }, socket: { remoteAddress: '10.0.0.7' } };
    expect(extractClientIp(req, true)).toBe('203.0.113.5');
  });

  it('falls back to the socket address when X-Forwarded-For is absent or empty', () => {
    expect(extractClientIp({ headers: {}, socket: { remoteAddress: '10.0.0.7' } }, true)).toBe('10.0.0.7');
    expect(extractClientIp({ headers: { 'x-forwarded-for': '  ' }, socket: { remoteAddress: '10.0.0.7' } }, true)).toBe(
      '10.0.0.7',
    );
  });

  it('returns "unknown" when there is no socket address at all', () => {
    expect(extractClientIp({ headers: {} }, true)).toBe('unknown');
  });
});

describe('client dist check', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-dist-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts an existing directory', () => {
    expect(isClientDistReady(dir)).toBe(true);
  });

  it('rejects a missing path', () => {
    expect(isClientDistReady(path.join(dir, 'does-not-exist'))).toBe(false);
  });

  it('rejects a path that is a file, not a directory', () => {
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, '<html></html>');
    expect(isClientDistReady(file)).toBe(false);
  });
});

describe('listen URLs', () => {
  it('includes localhost and every non-internal IPv4 address', () => {
    const urls = listenUrls(8097, '0.0.0.0');
    expect(urls[0]).toBe('http://localhost:8097/');
    expect(urls.slice(1)).toEqual(lanAddresses().map((a) => `http://${a}:8097/`));
  });

  it('uses the bound host instead of localhost when it is specific', () => {
    const urls = listenUrls(8097, '127.0.0.1');
    expect(urls[0]).toBe('http://127.0.0.1:8097/');
    expect(urls.some((u) => u.includes('localhost'))).toBe(false);
  });
});

describe('graceful shutdown persistence', () => {
  let server: ServerHandle;
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-rooms-'));
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('stop(); persistAll(); closeSockets() persists every started room', async () => {
    server = await startServer({
      port: 0,
      clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
      dataDir,
    });
    await startRoom(`ws://127.0.0.1:${server.port}/ws`, 3);
    // The exact SIGTERM/SIGINT shutdown sequence from main.ts:
    server.stop(); // 1. stop accepting new connections
    server.hub.persistAll(); // 2. persist all rooms
    await server.closeSockets(); // 3. close the sockets
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(1);
    // The server no longer accepts new connections.
    await expect(startRoom(`ws://127.0.0.1:${server.port}/ws`, 3)).rejects.toThrow();
  });
});
