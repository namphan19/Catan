// Entry point: one Node process serves the built client (static files) and the WebSocket
// endpoint on the same port (docs/PROTOCOL.md). Run with `pnpm --filter @hexgame/server start`.
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { Hub, type HubOptions } from './rooms';
import {
  extractClientIp,
  isClientDistReady,
  parseEnv,
  DEFAULT_HOST,
  DEFAULT_MAX_CONNECTIONS,
  DEFAULT_MAX_CONNECTIONS_PER_IP,
  DEFAULT_PORT,
  type EnvConfig,
} from './env';
import {
  MAX_FRAME_BYTES,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  RateLimiter,
} from './limits';
import { RoomStore } from './store';
import type { Conn } from './rooms';
import type { ServerMsg } from './protocol';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface ServerOptions extends Partial<Omit<EnvConfig, 'trustProxy'>> {
  hub?: HubOptions;
  /** Trust X-Forwarded-For for client IPs (TRUST_PROXY=1; only behind a reverse proxy). */
  trustProxy?: boolean;
}

export interface ServerHandle {
  port: number;
  hub: Hub;
  /** The WebSocket server; exposed for tests and supervision. */
  wss: WebSocketServer;
  /** Stop accepting new connections (graceful shutdown step 1). */
  stop(): void;
  /** Close all sockets: WebSockets are terminated, HTTP connections dropped (step 3). */
  closeSockets(): Promise<void>;
  close(): Promise<void>;
}

class WsConn implements Conn {
  readonly id: number;
  readonly rate = new RateLimiter();
  lastPong = Date.now();

  constructor(private readonly ws: WebSocket, id: number) {
    this.id = id;
  }

  send(msg: ServerMsg): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(code: number, reason: string): void {
    try {
      this.ws.close(code, reason.slice(0, 100));
    } catch {
      this.ws.terminate();
    }
  }
}

// ---------------------------------------------------------------- static files

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

function sendFile(res: http.ServerResponse, file: string, pathname: string, status = 200): void {
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  let body: Buffer;
  try {
    body = fs.readFileSync(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders(pathname, file) });
    res.end('Not found');
    return;
  }
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': body.length,
    ...securityHeaders(pathname, file),
  });
  res.end(body);
}

/**
 * Security headers (security review #9): nosniff everywhere, immutable caching only for
 * hashed bundle files under /assets/, no-cache for everything else (index.html must be
 * revalidated), and a CSP on SVG (scriptable when navigated to directly).
 */
function securityHeaders(pathname: string, file: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  };
  if (path.extname(file).toLowerCase() === '.svg') {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  }
  return headers;
}

/**
 * Static handler for packages/client/dist: correct content types, no directory listing,
 * unknown paths fall back to index.html (SPA), path traversal is rejected.
 */
export function createStaticHandler(rootDir: string): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  const root = path.resolve(rootDir);
  const indexHtml = path.join(root, 'index.html');
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', ...securityHeaders('/', '') });
      res.end();
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400, securityHeaders('/', ''));
      res.end();
      return;
    }
    const resolved = path.resolve(root, `.${path.posix.normalize(pathname)}`);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      res.writeHead(403, securityHeaders(pathname, ''));
      res.end();
      return;
    }
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(resolved);
    } catch {
      stat = undefined;
    }
    if (stat?.isFile()) {
      sendFile(res, resolved, pathname);
      return;
    }
    // Directories are not listed; unknown paths fall back to the SPA index (always no-cache,
    // even for /assets/ paths - only real hashed bundles get immutable caching).
    try {
      if (fs.existsSync(indexHtml) && fs.statSync(indexHtml).isFile()) {
        sendFile(res, indexHtml, '');
        return;
      }
    } catch {
      // fall through to 404
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders(pathname, '') });
    res.end('Not found');
  };
}

// ---------------------------------------------------------------- server

export function startServer(opts: ServerOptions = {}): Promise<ServerHandle> {
  const port = opts.port ?? Number(process.env.PORT ?? DEFAULT_PORT);
  const host = opts.host ?? process.env.HOST ?? DEFAULT_HOST;
  const clientDist = opts.clientDist ?? process.env.CLIENT_DIST ?? path.join(REPO_ROOT, 'packages', 'client', 'dist');
  const dataDir = opts.dataDir ?? process.env.DATA_DIR ?? path.join(REPO_ROOT, 'data', 'rooms');
  const trustProxy = opts.trustProxy ?? process.env.TRUST_PROXY === '1';
  const hub = new Hub({ store: new RoomStore(dataDir), ...opts.hub });
  const restored = hub.restore();
  if (restored > 0) console.log(`[server] restored ${restored} game(s) from ${dataDir}`);

  const serveStatic = createStaticHandler(clientDist);
  const httpServer = http.createServer(serveStatic);
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const maxConnections = opts.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const maxConnectionsPerIp = opts.maxConnectionsPerIp ?? DEFAULT_MAX_CONNECTIONS_PER_IP;
  const connsPerIp = new Map<string, number>();

  // Only /ws is a WebSocket endpoint; anything else gets its socket destroyed. Concurrent
  // connections are capped globally and per IP; excess upgrades get HTTP 503.
  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const ip = extractClientIp(req, trustProxy);
    if (wss.clients.size >= maxConnections || (connsPerIp.get(ip) ?? 0) >= maxConnectionsPerIp) {
      console.log(`[server] upgrade rejected (503): total ${wss.clients.size}, ip ${ip}`);
      socket.resume();
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      connsPerIp.set(ip, (connsPerIp.get(ip) ?? 0) + 1);
      ws.on('close', () => {
        const n = (connsPerIp.get(ip) ?? 1) - 1;
        if (n <= 0) connsPerIp.delete(ip);
        else connsPerIp.set(ip, n);
      });
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const conn = new WsConn(ws, hub.newConnId());
    hub.attach(conn);
    (ws as WebSocket & { _conn?: WsConn })._conn = conn;
    ws.on('pong', () => {
      conn.lastPong = Date.now();
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        conn.send({ type: 'error', code: 'BAD_MESSAGE', message: 'Binary frames are not supported.' });
        return;
      }
      // Rate limit per connection: excess gets RATE_LIMIT errors; 100 in a row closes.
      const verdict = conn.rate.record();
      if (verdict === 'close') {
        conn.close(1008, 'rate limit');
        return;
      }
      if (verdict === 'limited') {
        conn.send({
          type: 'error',
          code: 'RATE_LIMIT',
          message: 'Too many messages; slow down (max 20 per second).',
        });
        return;
      }
      try {
        hub.handleMessage(conn, data.toString('utf8'));
      } catch (e) {
        console.error(`[server] handler error: ${String(e)}`);
        conn.send({ type: 'error', code: 'INTERNAL', message: 'Internal server error.' });
      }
    });
    ws.on('error', () => {
      /* close follows */
    });
    ws.on('close', () => hub.detach(conn.id));
  });

  const pingTimer = setInterval(() => {
    // A throw in a timer callback must never kill the whole process (security review #4).
    try {
      const now = Date.now();
      for (const ws of wss.clients) {
        const conn = (ws as WebSocket & { _conn?: WsConn })._conn;
        if (conn) {
          if (now - conn.lastPong > PONG_TIMEOUT_MS) {
            conn.close(1000, 'ping timeout');
            continue;
          }
          ws.ping();
        } else {
          ws.ping();
        }
      }
    } catch (e) {
      console.error(`[server] ping sweep failed: ${String(e)}`);
    }
  }, PING_INTERVAL_MS);

  const sweepTimer = setInterval(() => {
    try {
      hub.sweep();
    } catch (e) {
      console.error(`[server] room sweep failed: ${String(e)}`);
    }
  }, 60_000);

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      printListenUrls(port, host);
      console.log(`[server] client: ${clientDist}, data: ${dataDir}, trustProxy: ${trustProxy}`);
      let accepting = true;
      const stopAccepting = (): void => {
        if (!accepting) return;
        accepting = false;
        clearInterval(pingTimer);
        clearInterval(sweepTimer);
        hub.close();
        httpServer.close();
      };
      const closeSockets = async (): Promise<void> => {
        for (const ws of wss.clients) ws.terminate();
        (httpServer as http.Server & { closeAllConnections?: () => void }).closeAllConnections?.();
        await Promise.all([
          new Promise<void>((res) => wss.close(() => res())),
          new Promise<void>((res) => httpServer.close(() => res())),
        ]);
      };
      resolve({
        port: (httpServer.address() as { port: number }).port,
        hub,
        wss,
        stop: stopAccepting,
        closeSockets,
        close: async () => {
          stopAccepting();
          await closeSockets();
        },
      });
    });
  });
}

/**
 * The URLs the server is reachable on: loopback plus every non-internal IPv4
 * address of the machine, so the host can share the LAN link.
 */
export function listenUrls(port: number, host: string): string[] {
  const urls: string[] = [];
  if (host === DEFAULT_HOST || host === '::') {
    urls.push(`http://localhost:${port}/`);
  } else {
    urls.push(`http://${host}:${port}/`);
  }
  for (const addr of lanAddresses()) {
    if (host === DEFAULT_HOST || host === '::' || addr === host) urls.push(`http://${addr}:${port}/`);
  }
  return urls;
}

/** Non-internal IPv4 addresses of this machine (os.networkInterfaces). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

function printListenUrls(port: number, host: string): void {
  console.log('[server] listening on:');
  for (const url of listenUrls(port, host)) {
    if (url.includes('localhost')) console.log(`[server]   local:   ${url}`);
    else console.log(`[server]   network: ${url}`);
  }
}

function main(): void {
  const parsed = parseEnv(process.env, {
    dataDir: path.join(REPO_ROOT, 'data', 'rooms'),
    clientDist: path.join(REPO_ROOT, 'packages', 'client', 'dist'),
  });
  if (parsed.errors.length > 0) {
    for (const line of parsed.errors) console.error(`[server] ${line}`);
    process.exit(1);
  }
  const cfg = parsed.config;
  if (!cfg) {
    console.error('[server] internal error: empty env config');
    process.exit(1);
  }
  if (!isClientDistReady(cfg.clientDist)) {
    console.error(`[server] CLIENT_DIST not found at ${cfg.clientDist}`);
    console.error('[server] Run pnpm build first');
    process.exit(1);
  }
  startServer(cfg)
    .then((handle) => {
      installShutdownHandlers(handle);
    })
    .catch((e) => {
      console.error(`[server] failed to start: ${String(e)}`);
      process.exit(1);
    });
}

/**
 * Graceful shutdown on SIGINT/SIGTERM (docs/PROTOCOL.md): stop accepting new
 * connections, persist every room, close the sockets, exit 0.
 */
function installShutdownHandlers(handle: ServerHandle): void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);
    void (async () => {
      try {
        handle.stop();
        handle.hub.persistAll();
        await handle.closeSockets();
        process.exit(0);
      } catch (e) {
        console.error(`[server] shutdown failed: ${String(e)}`);
        process.exit(1);
      }
    })();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
