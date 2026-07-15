import { describe, expect, it, vi } from 'vitest';
import { buildImportedPlace, createImportHandler, resolveImportPreview, tripadvisorDetailsPath } from './import-place.js';
import { ImportProviderError, ImportSecurityError } from './importSecurity.js';

const publicLookup = async () => [{ address: '8.8.8.8', family: 4 }];

describe('place import resolution', () => {
  it('uses the Google official adapter before metadata and returns an exact canonical preview', async () => {
    const official = vi.fn(async () => ({ title: 'Café Norte', address: 'Calle Norte 1', lat: 37.39, lng: -5.99 }));
    const metadata = vi.fn();
    const preview = await resolveImportPreview('https://maps.google.com/maps/place/Cafe', { officialAdapters: { google: official }, metadata, lookup: publicLookup });
    expect(official).toHaveBeenCalledOnce();
    expect(metadata).not.toHaveBeenCalled();
    expect(preview).toMatchObject({ source: { provider: 'google' }, quality: { coordinateQuality: 'exact', provenance: 'official_api' } });
  });

  it('does not treat Nominatim as an Apple official API and falls back deterministically after metadata', async () => {
    const calls = [];
    const metadata = vi.fn(async () => { calls.push('metadata'); return { title: 'Apple Café', address: 'Madrid' }; });
    const geocoder = vi.fn(async () => { calls.push('geocoder'); return { title: 'Apple Café', address: 'Madrid', lat: 40.4, lng: -3.7 }; });
    const preview = await resolveImportPreview('https://maps.apple.com/?q=Apple+Cafe', { metadata, geocoder, lookup: publicLookup });
    expect(calls).toEqual(['metadata', 'geocoder']);
    expect(preview.quality).toMatchObject({ coordinateQuality: 'geocoded', provenance: 'geocoder' });
  });

  it.each([['network', new ImportProviderError('offline')], ['5xx', new ImportProviderError('503')]])('returns a safe local fallback for recoverable %s provider failures', async (_name, error) => {
    const preview = await resolveImportPreview('https://www.tripadvisor.com/Restaurant_Review-g1-d1234-Reviews-Cafe.html', {
      officialAdapters: { tripadvisor: async () => { throw error; } },
      metadata: async () => { throw error; },
      lookup: publicLookup,
    });
    expect(preview.quality).toMatchObject({ confidence: 'low', warnings: expect.arrayContaining(['LOCAL_FALLBACK']) });
  });

  it.each([
    ['Google', 'https://maps.google.com/maps/place/Cafe/@37.39,-5.99,15z', 37.39, -5.99],
    ['Apple', 'https://maps.apple.com/?q=Apple+Cafe&ll=40.4,-3.7', 40.4, -3.7],
  ])('preserves embedded %s URL coordinates in the honest local fallback', async (_provider, url, lat, lng) => {
    const preview = await resolveImportPreview(url, { lookup: publicLookup });
    expect(preview).toMatchObject({ place: { lat, lng }, quality: { coordinateQuality: 'approximate', warnings: expect.arrayContaining(['APPROXIMATE_COORDINATES', 'LOCAL_FALLBACK']) } });
  });

  it.each([['network', async () => { throw new TypeError('offline'); }], ['5xx', async () => new Response('', { status: 503, headers: { 'content-type': 'text/html' } })]])('uses LOCAL_FALLBACK for production metadata HTML %s failures', async (_name, fetchImpl) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);
    await expect(buildImportedPlace('https://maps.google.com/maps/place/Cafe', { lookup: publicLookup })).resolves.toMatchObject({ quality: { warnings: expect.arrayContaining(['LOCAL_FALLBACK']) } });
    spy.mockRestore();
  });

  it('rejects malformed input and never converts hard or programming failures into candidates', async () => {
    await expect(resolveImportPreview('https://example.test/nope', { lookup: publicLookup })).rejects.toMatchObject({ status: 400 });
    for (const error of [new ImportSecurityError(415, 'malformed JSON'), new ImportSecurityError(403, 'private DNS'), new ImportSecurityError(502, 'timeout'), new ImportSecurityError(413, 'oversized'), new ImportSecurityError(400, 'invalid status'), new Error('bug')]) {
      await expect(resolveImportPreview('https://maps.google.com/maps/place/Cafe', { officialAdapters: { google: async () => { throw error; } }, metadata: async () => ({ title: 'candidate' }), lookup: publicLookup })).rejects.toMatchObject({ status: 502 });
    }
  });

  it.each([
    ['blocked redirect', new ImportSecurityError(502, 'blocked redirect https://127.0.0.1/token')],
    ['private DNS', new ImportSecurityError(403, 'private DNS 127.0.0.1')],
    ['oversized response', new ImportSecurityError(413, 'response too large')],
    ['invalid content', new ImportSecurityError(415, 'unexpected HTML')],
    ['bad status', new ImportSecurityError(400, 'upstream 401')],
  ])('propagates %s as a safe failure instead of making a local candidate', async (_name, error) => {
    await expect(resolveImportPreview('https://maps.google.com/maps/place/Cafe', {
      officialAdapters: { google: async () => { throw error; } },
      metadata: async () => ({ title: 'hostile metadata' }),
      lookup: publicLookup,
    })).rejects.toMatchObject({ status: 502, message: 'No se pudo consultar el enlace en este momento.' });
  });

  it('uses metadata then the constrained geocoder for production Apple resolution without an Apple official adapter', async () => {
    const calls = [];
    const preview = await buildImportedPlace('https://maps.apple.com/?q=Apple+Cafe', {
      officialAdapters: { apple: async () => calls.push('official') },
      metadata: async () => { calls.push('metadata'); return { title: 'Apple Café', address: 'Madrid' }; },
      geocoder: async () => { calls.push('geocoder'); return { lat: 40.4, lng: -3.7 }; },
      lookup: publicLookup,
    });
    expect(calls).toEqual(['metadata', 'geocoder']);
    expect(preview).toMatchObject({ source: { provider: 'apple' }, quality: { coordinateQuality: 'geocoded', provenance: 'geocoder' } });
  });

  it('returns the canonical preview from the authenticated handler while retaining explicit legacy aliases', async () => {
    const status = vi.fn().mockReturnThis();
    const response = { status, json: vi.fn(), setHeader: vi.fn() };
    const handler = createImportHandler({
      rateLimiter: { check: () => ({ allowed: true, retryAfter: 1 }) },
      verifyToken: async () => ({ uid: 'user-1' }),
      buildPlace: async () => ({ source: { provider: 'google' }, place: { title: 'Café', lat: 1, lng: 2 }, quality: { coordinateQuality: 'exact' }, duplicate: { status: 'none' }, editableFields: ['title'] }),
    });
    await handler({ method: 'POST', headers: { authorization: 'Bearer token' }, body: { url: 'https://maps.google.com/?q=Cafe' } }, response);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ source: { provider: 'google' }, duplicate: { status: 'none' }, editableFields: ['title'], title: 'Café', sourceType: 'google' }));
  });

  it.each([
    ['Café Norte', 'sushi_restaurant', ['restaurant', 'sushi_restaurant'], 'restaurant', ['Sushi', 'Japonés'], 4.5],
    ['Café Centro', 'coffee_shop', ['cafe', 'coffee_shop'], 'cafe', [], 4.5],
    ['Bazar Norte', 'unknown_type', ['unknown_type'], 'other', [], 4],
  ])('uses the production Google adapter and shared placeData parity for %s', async (title, primaryType, types, category, tags, rating) => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
    const fetchImpl = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ places: [{ displayName: { text: title }, formattedAddress: 'Calle Norte 1', location: { latitude: 37.39, longitude: -5.99 }, primaryType, types, rating }] }), { headers: { 'content-type': 'application/json' } }));
    const place = await buildImportedPlace('https://maps.google.com/maps/place/Cafe', { lookup: publicLookup });
    expect(fetchImpl).toHaveBeenCalledWith('https://places.googleapis.com/v1/places:searchText', expect.objectContaining({ headers: expect.objectContaining({ 'x-goog-fieldmask': expect.stringContaining('places.primaryType,places.types,places.rating') }) }));
    expect(place).toMatchObject({ title, name: title, category, tags, rating });
    fetchImpl.mockRestore();
    vi.unstubAllEnvs();
  });

  it.each(['1234', '987654'])('constructs Tripadvisor API paths only from digits-only IDs (%s)', (id) => {
    expect(tripadvisorDetailsPath(id)).toBe(`/api/v1/location/${id}/details?language=es`);
  });

  it.each(['', '12/../../secret', 'abc123'])('rejects hostile Tripadvisor IDs before path construction (%s)', (id) => {
    expect(() => tripadvisorDetailsPath(id)).toThrow('El enlace no es compatible');
  });
});
