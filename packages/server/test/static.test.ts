// Static file handler (security review "missing tests"): traversal variants, content
// types, cache headers, nosniff, SVG CSP and the SPA fallback.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStaticHandler } from '../src/main';

interface FakeRes {
  status: number | null;
  headers: Record<string, string>;
  body: string;
  writeHead(status: number, headers?: Record<string, unknown>): unknown;
  end(body?: unknown): void;
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    status: null,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      res.status = status;
      for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = String(v);
      return res;
    },
    end(body) {
      if (body !== undefined && body !== null && typeof body !== 'function') res.body = body.toString();
    },
  };
  return res;
}

function call(handler: ReturnType<typeof createStaticHandler>, method: string, url: string): FakeRes {
  const res = fakeRes();
  handler(
    { method, url } as unknown as import('node:http').IncomingMessage,
    res as unknown as import('node:http').ServerResponse,
  );
  return res;
}

let root: string;
let base: string;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-static-'));
  root = path.join(base, 'dist');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<html>SPA-INDEX</html>');
  fs.writeFileSync(path.join(root, 'assets', 'app-a1b2c3d4.js'), 'console.log("bundle");');
  fs.writeFileSync(path.join(root, 'assets', 'icon-e5f6a7b8.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(root, 'data.json'), '{"k":1}');
  // A secret in the PARENT of the served root: no traversal variant may ever serve it.
  fs.writeFileSync(path.join(base, 'secret.txt'), 'TOPSECRET');
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

const handler = () => createStaticHandler(root);

describe('static handler', () => {
  it('serves files with correct content types', () => {
    const h = handler();
    const html = call(h, 'GET', '/index.html');
    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toBe('text/html; charset=utf-8');
    const js = call(h, 'GET', '/assets/app-a1b2c3d4.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');
    const svg = call(h, 'GET', '/assets/icon-e5f6a7b8.svg');
    expect(svg.status).toBe(200);
    expect(svg.headers['content-type']).toBe('image/svg+xml');
    const json = call(h, 'GET', '/data.json');
    expect(json.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('caches hashed /assets/ bundles immutable and everything else no-cache', () => {
    const h = handler();
    expect(call(h, 'GET', '/assets/app-a1b2c3d4.js').headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(call(h, 'GET', '/index.html').headers['cache-control']).toBe('no-cache');
    expect(call(h, 'GET', '/').headers['cache-control']).toBe('no-cache');
    expect(call(h, 'GET', '/data.json').headers['cache-control']).toBe('no-cache');
  });

  it('sends X-Content-Type-Options: nosniff on every response', () => {
    const h = handler();
    expect(call(h, 'GET', '/index.html').headers['x-content-type-options']).toBe('nosniff');
    expect(call(h, 'GET', '/assets/app-a1b2c3d4.js').headers['x-content-type-options']).toBe('nosniff');
    expect(call(h, 'GET', '/definitely-missing').headers['x-content-type-options']).toBe('nosniff');
    expect(call(h, 'POST', '/').headers['x-content-type-options']).toBe('nosniff');
    expect(call(h, 'GET', '/%zz').headers['x-content-type-options']).toBe('nosniff');
  });

  it('sends a CSP header on SVG responses', () => {
    const h = handler();
    expect(call(h, 'GET', '/assets/icon-e5f6a7b8.svg').headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    );
    expect(call(h, 'GET', '/assets/app-a1b2c3d4.js').headers['content-security-policy']).toBeUndefined();
  });

  it('falls back to the SPA index for unknown paths (no-cache, not immutable)', () => {
    const h = handler();
    const spa = call(h, 'GET', '/some/client/route');
    expect(spa.status).toBe(200);
    expect(spa.body).toBe('<html>SPA-INDEX</html>');
    expect(spa.headers['cache-control']).toBe('no-cache');
    // Even a missing asset path falls back without immutable caching.
    const missingAsset = call(h, 'GET', '/assets/missing-1234.js');
    expect(missingAsset.body).toBe('<html>SPA-INDEX</html>');
    expect(missingAsset.headers['cache-control']).toBe('no-cache');
  });

  it('rejects non-GET/HEAD with 405 and bad encodings with 400', () => {
    const h = handler();
    expect(call(h, 'POST', '/').status).toBe(405);
    expect(call(h, 'PUT', '/').status).toBe(405);
    expect(call(h, 'GET', '/%zz').status).toBe(400);
  });

  it('never serves files outside the root (traversal variants)', () => {
    const h = handler();
    for (const url of [
      '/..%5c..%5csecret.txt', // decoded backslashes escape root on win32
      '/assets/..%5c..%5csecret.txt',
      '/..%2f..%2fsecret.txt', // encoded slashes collapse back inside the root
      '/%2e%2e%2fsecret.txt',
      '/..\\..\\secret.txt',
      '/../../secret.txt',
      '/a/../../../../../../secret.txt',
    ]) {
      const res = call(h, 'GET', url);
      expect(res.body).not.toContain('TOPSECRET');
      if (res.status === 200) {
        // Anything served must be the SPA index, never the outside file.
        expect(res.body).toBe('<html>SPA-INDEX</html>');
      } else {
        expect([403, 404]).toContain(res.status);
      }
    }
  });
});
