import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { ImportProviderError, ImportSecurityError, assertPublicSupportedUrl, clearFirebaseJwksCache, createBestEffortRateLimiter, fetchFixedJson, fetchSafeHtml, isPublicIp, MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS, verifyFirebaseIdToken } from './importSecurity.js';
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

  it('limits redirects to four and keeps stable errors free of hostile URL data', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 302, headers: { location: 'https://maps.google.com/?q=secret-token' } }));
    await expect(fetchSafeHtml('https://maps.google.com/?q=Cafe', { fetchImpl, lookup: publicLookup, maxRedirects: 4 })).rejects.toMatchObject({ status: 502, message: 'El enlace supera el máximo de redirecciones.' });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('fetches JSON only from server-owned public fixed origins', async () => {
    await expect(fetchFixedJson('https://places.googleapis.com', '/v1/places', {
      lookup: publicLookup,
      fetchImpl: async () => new Response(JSON.stringify({ places: [] }), { headers: { 'content-type': 'application/json' } }),
    })).resolves.toEqual({ places: [] });
    await expect(fetchFixedJson('https://places.googleapis.com', 'https://evil.test/data', { lookup: publicLookup })).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['network failure', async () => { throw new TypeError('offline'); }, ImportProviderError],
    ['upstream 5xx', async () => new Response('', { status: 503 }), ImportProviderError],
    ['malformed JSON', async () => new Response('{', { headers: { 'content-type': 'application/json' } }), ImportSecurityError],
    ['invalid redirect', async () => new Response('', { status: 302 }), ImportSecurityError],
    ['invalid non-recoverable status', async () => new Response('', { status: 401 }), ImportSecurityError],
  ])('classifies fixed-provider %s explicitly', async (_name, fetchImpl, ErrorType) => {
    await expect(fetchFixedJson('https://places.googleapis.com', '/v1/places', { lookup: publicLookup, fetchImpl })).rejects.toBeInstanceOf(ErrorType);
  });

  it.each([['transport', async () => { throw new TypeError('offline'); }, ImportProviderError], ['post-fetch', async () => ({ ok: true, status: 200, headers: { get: () => { throw new TypeError('bug'); } } }), TypeError]])('recovers only transport %s TypeErrors', async (_name, fetchImpl, ErrorType) => {
    await expect(fetchSafeHtml('https://maps.google.com/?q=Cafe', { lookup: publicLookup, fetchImpl })).rejects.toBeInstanceOf(ErrorType);
  });

  it.each([
    ['HTML', (lookup) => fetchSafeHtml('https://maps.google.com/?q=Cafe', { lookup, fetchImpl: async () => new Response('', { headers: { 'content-type': 'text/html' } }) })],
    ['fixed JSON', (lookup) => fetchFixedJson('https://places.googleapis.com', '/v1/places', { lookup, fetchImpl: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) })],
  ])('classifies known DNS transport failures as recoverable at the %s boundary', async (_name, request) => {
    for (const code of ['ENOTFOUND', 'EAI_AGAIN']) {
      const error = Object.assign(new Error(code), { code });
      await expect(request(async () => { throw error; })).rejects.toBeInstanceOf(ImportProviderError);
    }
    const programmingError = new Error('lookup bug');
    await expect(request(async () => { throw programmingError; })).rejects.toBe(programmingError);
  });

  it('keeps fixed JSON post-fetch TypeErrors hard while recovering only transport TypeErrors and 5xx', async () => {
    const request = (fetchImpl) => fetchFixedJson('https://places.googleapis.com', '/v1/places', { lookup: publicLookup, fetchImpl });
    await expect(request(async () => { throw new TypeError('offline'); })).rejects.toBeInstanceOf(ImportProviderError);
    await expect(request(async () => new Response('', { status: 503 }))).rejects.toBeInstanceOf(ImportProviderError);
    await expect(request(async () => ({ ok: true, status: 200, headers: { get: () => { throw new TypeError('headers bug'); } } }))).rejects.toBeInstanceOf(TypeError);
  });
  it.each(['https://user:secret@places.googleapis.com', 'https://places.googleapis.com:8443'])('rejects fixed provider origins with credentials or custom ports', async (origin) => {
    await expect(fetchFixedJson(origin, '/v1/places', { lookup: publicLookup })).rejects.toMatchObject({ status: 400 });
  });

  it('keeps the required nine-second and one-MiB defaults', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(9000);
    expect(MAX_RESPONSE_BYTES).toBe(1024 * 1024);
  });

  it('turns an aborted bounded fetch into a stable timeout failure', async () => {
    const fetchImpl = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' }))));
    await expect(fetchFixedJson('https://places.googleapis.com', '/v1/places', { lookup: publicLookup, fetchImpl, timeoutMs: 1 })).rejects.toMatchObject({ status: 502, message: 'La importación del enlace agotó el tiempo de espera.' });
  });

  it('redacts raw upstream error text from the handler log and stable response', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const status = vi.fn().mockReturnThis();
    const response = { status, json: vi.fn(), setHeader: vi.fn() };
    const handler = createImportHandler({ rateLimiter: { check: () => ({ allowed: true, retryAfter: 1 }) }, verifyToken: async () => ({ uid: 'user' }), buildPlace: async () => { throw new Error('upstream-secret=leak'); } });
    await handler({ method: 'POST', headers: { authorization: 'Bearer token' }, body: {} }, response);
    expect(error).toHaveBeenCalledWith(expect.not.stringContaining('upstream-secret=leak'));
    expect(response.json).toHaveBeenCalledWith({ error: 'No se pudo consultar el enlace en este momento.' });
    error.mockRestore();
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
    })).rejects.toBeInstanceOf(ImportProviderError);
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

  it('bounds rate-limiter memory and admits new keys after expired buckets are evicted', () => {
    let timestamp = 1_000;
    const limiter = createBestEffortRateLimiter({ limit: 2, windowMs: 100, maxBuckets: 2, now: () => timestamp });
    expect(limiter.check('first').allowed).toBe(true);
    expect(limiter.check('second').allowed).toBe(true);
    expect(limiter.check('third').allowed).toBe(false);
    timestamp = 1_101;
    expect(limiter.check('third').allowed).toBe(true);
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
