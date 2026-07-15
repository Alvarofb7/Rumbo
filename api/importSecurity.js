import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { Buffer } from 'node:buffer';
import { normalizeSupportedPlaceUrl } from '../src/lib/placeUrl.js';

export const MAX_REDIRECTS = 4;
export const MAX_RESPONSE_BYTES = 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 9000;

export class ImportSecurityError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ImportSecurityError';
    this.status = status;
  }
}

export class ImportProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportProviderError';
  }
}

function isRecoverableDnsFailure(error) {
  return error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN';
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

export function isPublicIp(address) {
  const family = isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  // Reject special-use IPv6 conservatively. The import host is an exact vendor
  // allowlist entry, so DNS is not attacker-controlled; it is still checked on
  // every redirect to prevent a vendor DNS/configuration mistake from reaching a private network.
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('::') || normalized.startsWith('::ffff:') ||
    /^f[cd]/.test(normalized) || /^fe[89abcdef]/.test(normalized) || normalized.startsWith('ff') || normalized.startsWith('2001:db8:')) return false;
  return true;
}

export async function assertPublicSupportedUrl(rawUrl, { lookup = dnsLookup } = {}) {
  const normalizedUrl = normalizeSupportedPlaceUrl(rawUrl);
  const url = new URL(normalizedUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new ImportSecurityError(403, 'El host del enlace no es público.');
  }
  let records;
  try { records = await lookup(hostname, { all: true, verbatim: true }); }
  catch (error) {
    if (isRecoverableDnsFailure(error)) throw new ImportProviderError('El sitio de origen no está disponible.');
    throw error;
  }
  if (!records.length || records.some(({ address }) => !isPublicIp(address))) {
    throw new ImportSecurityError(403, 'El host del enlace no es público.');
  }
  return normalizedUrl;
}

async function readLimitedBody(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ImportSecurityError(413, 'La respuesta del enlace es demasiado grande.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel?.();
        throw new ImportSecurityError(413, 'La respuesta del enlace es demasiado grande.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export async function fetchSafeHtml(rawUrl, {
  fetchImpl = fetch,
  lookup = dnsLookup,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxRedirects = MAX_REDIRECTS,
  maxBytes = MAX_RESPONSE_BYTES,
} = {}) {
  let currentUrl = await assertPublicSupportedUrl(rawUrl, { lookup });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      let response;
      try { response = await fetchImpl(currentUrl, { redirect: 'manual', signal: controller.signal, headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'es,en;q=0.8', 'user-agent': 'RumboPersonalApp/1.0' } }); }
      catch (error) { if (error instanceof TypeError) throw new ImportProviderError('El sitio de origen no está disponible.'); throw error; }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new ImportSecurityError(502, 'El enlace redirige a un destino no válido.');
        if (redirects === maxRedirects) throw new ImportSecurityError(502, 'El enlace supera el máximo de redirecciones.');
        currentUrl = await assertPublicSupportedUrl(new URL(location, currentUrl).toString(), { lookup });
        continue;
      }
      if (!response.ok) {
        if (response.status >= 500) throw new ImportProviderError('El sitio de origen no está disponible.');
        throw new ImportSecurityError(502, 'El sitio de origen no respondió correctamente.');
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        await response.body?.cancel?.();
        throw new ImportSecurityError(413, 'La respuesta del enlace es demasiado grande.');
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().startsWith('text/html') && !contentType.toLowerCase().startsWith('application/xhtml+xml')) {
        throw new ImportSecurityError(415, 'El enlace no devuelve contenido HTML compatible.');
      }
      return { ok: true, status: response.status, finalUrl: currentUrl, html: await readLimitedBody(response, maxBytes) };
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new ImportSecurityError(502, 'La importación del enlace agotó el tiempo de espera.');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  throw new ImportSecurityError(502, 'No se pudo resolver el enlace.');
}

export async function fetchFixedJson(fixedOrigin, pathname, {
  fetchImpl = fetch,
  lookup = dnsLookup,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxBytes = MAX_RESPONSE_BYTES,
  headers = {},
  method = 'GET',
  body,
} = {}) {
  const origin = new URL(fixedOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port) throw new ImportSecurityError(400, 'El origen del proveedor no es válido.');
  const url = new URL(pathname, origin);
  if (url.origin !== origin.origin) throw new ImportSecurityError(400, 'El origen del proveedor no es válido.');
  let records;
  try { records = await lookup(origin.hostname, { all: true, verbatim: true }); }
  catch (error) {
    if (isRecoverableDnsFailure(error)) throw new ImportProviderError('El proveedor no está disponible.');
    throw error;
  }
  if (!records.length || records.some(({ address }) => !isPublicIp(address))) throw new ImportSecurityError(403, 'El host del enlace no es público.');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try { response = await fetchImpl(url.toString(), { method, body, signal: controller.signal, redirect: 'manual', headers: { accept: 'application/json', ...headers } }); }
    catch (error) {
      if (error.name === 'AbortError') throw new ImportSecurityError(502, 'La importación del enlace agotó el tiempo de espera.');
      if (error instanceof TypeError) throw new ImportProviderError('El proveedor no está disponible.');
      throw error;
    }
    if ([301, 302, 303, 307, 308].includes(response.status) || (response.status >= 400 && response.status < 500)) throw new ImportSecurityError(502, 'El proveedor no respondió correctamente.');
    if (!response.ok) throw new ImportProviderError('El proveedor no está disponible.');
    if (!(response.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new ImportSecurityError(415, 'El proveedor no devolvió JSON compatible.');
    try { return JSON.parse(await readLimitedBody(response, maxBytes)); } catch (error) {
      if (error instanceof SyntaxError) throw new ImportSecurityError(502, 'El proveedor no devolvió JSON válido.');
      throw error;
    }
  } finally { clearTimeout(timeoutId); }
}

function base64UrlToBytes(value) {
  return Uint8Array.from(Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

let cachedJwks;

function jwksTtl(response) {
  const maxAge = Number(response.headers?.get?.('cache-control')?.match(/max-age=(\d+)/i)?.[1]);
  return Math.min(3_600_000, Math.max(60_000, Number.isFinite(maxAge) ? maxAge * 1000 : 300_000));
}

export function clearFirebaseJwksCache() { cachedJwks = undefined; }

async function getFirebaseJwks({ fetchImpl, now, timeoutMs }) {
  if (cachedJwks?.expiresAt > now()) return cachedJwks.keys;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', { signal: controller.signal });
    if (!response.ok) throw new ImportSecurityError(502, 'La autenticación segura no está disponible.');
    const body = await response.json();
    cachedJwks = { keys: body.keys || [], expiresAt: now() + jwksTtl(response) };
    return cachedJwks.keys;
  } catch (error) {
    if (error.name === 'AbortError') throw new ImportSecurityError(502, 'La autenticación segura agotó el tiempo de espera.');
    throw error;
  } finally { clearTimeout(timeoutId); }
}

export async function verifyFirebaseIdToken(token, { projectId, fetchImpl = fetch, now = () => Date.now(), timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (!projectId) throw new ImportSecurityError(502, 'La importación segura no está disponible.');
  if (!token || typeof token !== 'string') throw new ImportSecurityError(401, 'Inicia sesión para importar enlaces.');
  const [encodedHeader, encodedPayload, encodedSignature, ...extra] = token.split('.');
  if (extra.length || !encodedHeader || !encodedPayload || !encodedSignature) throw new ImportSecurityError(401, 'La sesión no es válida. Vuelve a iniciar sesión.');
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(base64UrlToBytes(encodedHeader)).toString('utf8'));
    payload = JSON.parse(Buffer.from(base64UrlToBytes(encodedPayload)).toString('utf8'));
  } catch {
    throw new ImportSecurityError(401, 'La sesión no es válida. Vuelve a iniciar sesión.');
  }
  if (header.alg !== 'RS256' || !header.kid || payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || !payload.sub || payload.sub !== payload.user_id) {
    throw new ImportSecurityError(401, 'La sesión no pertenece a este proyecto.');
  }
  const currentSeconds = Math.floor(now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= currentSeconds || (payload.iat && payload.iat > currentSeconds + 60)) throw new ImportSecurityError(401, 'Tu sesión ha caducado. Vuelve a iniciar sesión.');
  const keys = await getFirebaseJwks({ fetchImpl, now, timeoutMs });
  const key = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
  if (!key) throw new ImportSecurityError(401, 'La sesión no es válida. Vuelve a iniciar sesión.');
  const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, base64UrlToBytes(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  if (!valid) throw new ImportSecurityError(401, 'La sesión no es válida. Vuelve a iniciar sesión.');
  return { uid: payload.sub };
}

export function createBestEffortRateLimiter({
  limit = 10,
  windowMs = 60_000,
  maxBuckets = 1000,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();
  return {
    check(key) {
      const timestamp = now();
      let bucket = buckets.get(key);
      if (!bucket && buckets.size >= maxBuckets) {
        for (const [bucketKey, candidate] of buckets) {
          if (candidate.resetAt <= timestamp) buckets.delete(bucketKey);
        }
        if (buckets.size >= maxBuckets) {
          return { allowed: false, retryAfter: Math.max(1, Math.ceil(windowMs / 1000)) };
        }
      }
      bucket ||= { count: 0, resetAt: timestamp + windowMs };
      if (bucket.resetAt <= timestamp) Object.assign(bucket, { count: 0, resetAt: timestamp + windowMs });
      bucket.count += 1;
      buckets.set(key, bucket);
      return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)) };
    },
  };
}
