import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { ImportSecurityError, assertPublicSupportedUrl, clearFirebaseJwksCache, createBestEffortRateLimiter, fetchSafeHtml, isPublicIp, verifyFirebaseIdToken } from './importSecurity.js';
import { createImportHandler } from './import-place.js';

const publicLookup = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]);

describe('import security', () => {
  it.each(['https://maps.google.com/?q=Cafe', 'http://maps.google.com/?q=Cafe', 'https://localhost/', 'https://127.0.0.1/', 'https://user@maps.apple.com/', 'https://maps.google.com.evil.test/', 'https://google.evil/'])(
    'rejects invalid, private, or unsupported URL %s',
    async (url) => {
      if (url === 'https://maps.google.com/?q=Cafe') await expect(assertPublicSupportedUrl(url, { lookup: publicLookup })).resolves.toContain('maps.google.com');
      else await expect(assertPublicSupportedUrl(url, { lookup: publicLookup })).rejects.toThrow();
    },
  );

  it('revalidates redirect destinations before following them', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 302, headers: { location: 'https://maps.apple.com/?q=Cafe' } }));
    const lookup = vi.fn(async (host) => (host === 'maps.apple.com' ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '8.8.8.8', family: 4 }]));
    await expect(fetchSafeHtml('https://maps.google.com/?q=Cafe', { fetchImpl, lookup })).rejects.toThrow('no es público');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('enforces HTML content and response-size boundaries', async () => {
    await expect(fetchSafeHtml('https://maps.google.com/?q=Cafe', {
      lookup: publicLookup,
      fetchImpl: async () => new Response('x', { headers: { 'content-type': 'application/json' } }),
    })).rejects.toThrow('HTML');
    await expect(fetchSafeHtml('https://maps.google.com/?q=Cafe', {
      lookup: publicLookup,
      maxBytes: 3,
      fetchImpl: async () => new Response('toolong', { headers: { 'content-type': 'text/html' } }),
    })).rejects.toThrow('demasiado grande');
    await expect(fetchSafeHtml('https://maps.google.com/?q=Cafe', {
      lookup: publicLookup,
      fetchImpl: async () => new Response('unavailable', { status: 503, headers: { 'content-type': 'text/html' } }),
    })).rejects.toMatchObject({ status: 502 });
  });

  it('cancels an oversized stream and rejects non-global IPv6 records', async () => {
    const cancel = vi.fn();
    const reader = { read: vi.fn(async () => ({ done: false, value: new Uint8Array(4) })), cancel, releaseLock: vi.fn() };
    await expect(fetchSafeHtml('https://maps.google.com/?q=Cafe', {
      lookup: publicLookup, maxBytes: 3,
      fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }), body: { getReader: () => reader } }),
    })).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
    for (const address of ['::', '::1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', 'ff02::1']) expect(isPublicIp(address)).toBe(false);
  });

  it('rejects reserved DNS records without making an HTTP request', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchSafeHtml('https://maps.google.com/?q=Cafe', {
      fetchImpl,
      lookup: async () => [{ address: '203.0.113.7', family: 4 }],
    })).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('limits imports per user and IP with a retry window', () => {
    const limiter = createBestEffortRateLimiter({ limit: 1, windowMs: 10_000, now: () => 1_000 });
    expect(limiter.check('user:ip').allowed).toBe(true);
    expect(limiter.check('user:ip')).toMatchObject({ allowed: false, retryAfter: 10 });
  });

  it('rejects missing authentication before importing', async () => {
    const status = vi.fn().mockReturnThis();
    const response = { status, json: vi.fn(), setHeader: vi.fn() };
    const handler = createImportHandler({ verifyToken: vi.fn(async () => { throw new Error('Falta el token de autenticación.'); }) });
    await handler({ method: 'POST', headers: {}, body: { url: 'https://maps.google.com/?q=Cafe' } }, response);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns safe status codes without exposing upstream errors', async () => {
    const status = vi.fn().mockReturnThis();
    const response = { status, json: vi.fn(), setHeader: vi.fn() };
    const rateLimiter = { check: vi.fn(() => ({ allowed: true, retryAfter: 60 })) };
    const handler = createImportHandler({
      rateLimiter,
      verifyToken: vi.fn(async () => ({ uid: 'user-1' })),
      buildPlace: vi.fn(async () => { throw new ImportSecurityError(415, 'El enlace no devuelve contenido HTML compatible.'); }),
    });
    await handler({ method: 'POST', headers: { authorization: 'Bearer token', 'x-forwarded-for': '198.51.100.1' }, body: { url: 'https://maps.google.com/?q=Cafe' } }, response);
    expect(status).toHaveBeenCalledWith(415);
    expect(response.json).toHaveBeenCalledWith({ error: 'El enlace no devuelve contenido HTML compatible.' });
    expect(rateLimiter.check).toHaveBeenNthCalledWith(1, 'ip:198.51.100.1');
    expect(rateLimiter.check).toHaveBeenNthCalledWith(2, 'user:user-1');
  });

  it('limits an IP before JWT verification', async () => {
    const status = vi.fn().mockReturnThis();
    const verifyToken = vi.fn();
    const handler = createImportHandler({ rateLimiter: { check: vi.fn(() => ({ allowed: false, retryAfter: 60 })) }, verifyToken });
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.1' }, body: {} }, { status, json: vi.fn(), setHeader: vi.fn() });
    expect(status).toHaveBeenCalledWith(429);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('rejects missing Firebase tokens before attempting key retrieval', async () => {
    const fetchImpl = vi.fn();
    await expect(verifyFirebaseIdToken('', { projectId: 'rumbo-test', fetchImpl })).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses a bounded JWKS cache and does not refresh unknown kids before expiry', async () => {
    clearFirebaseJwksCache();
    const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encoded({ alg: 'RS256', kid: 'unknown' })}.${encoded({ aud: 'rumbo-test', iss: 'https://securetoken.google.com/rumbo-test', sub: 'user', user_id: 'user', exp: 2_000_000_000 })}.signature`;
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ keys: [] }), { headers: { 'cache-control': 'max-age=120' } }));
    await expect(verifyFirebaseIdToken(token, { projectId: 'rumbo-test', fetchImpl })).rejects.toMatchObject({ status: 401 });
    await expect(verifyFirebaseIdToken(token, { projectId: 'rumbo-test', fetchImpl })).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    clearFirebaseJwksCache();
  });
});
