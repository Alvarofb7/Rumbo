import { describe, expect, it, vi } from 'vitest';
import { applyPreviewCoordinates, canConfirmImportPreview, importPlaceFromUrl, updateImportPreview } from './placeImporter';
import { normalizeImportPreview } from './importPreview';

describe('local link import', () => {
  it('parses supported links locally without fetching or requiring Firebase authentication', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const place = await importPlaceFromUrl('https://maps.google.com/?q=Cafe', { user: { isLocal: true } });
    expect(place).toMatchObject({ source: { canonicalUrl: 'https://maps.google.com/?q=Cafe' }, place: { title: 'Cafe' }, quality: { provenance: 'local_parser' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the validated local parser for authenticated upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'temporarily unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })));
    const place = await importPlaceFromUrl('https://maps.google.com/?q=Cafe', { user: { getIdToken: vi.fn().mockResolvedValue('token') } });
    expect(place).toMatchObject({ source: { canonicalUrl: 'https://maps.google.com/?q=Cafe' }, place: { title: 'Cafe' }, quality: { provenance: 'local_parser' } });
  });

  it('does not bypass authenticated authorization failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'content-type': 'application/json' } })));
    await expect(importPlaceFromUrl('https://maps.google.com/?q=Cafe', { user: { getIdToken: vi.fn().mockResolvedValue('token') } })).rejects.toThrow('No autorizado');
  });

  it('falls back locally when Firebase cannot obtain a token because the network is unavailable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const networkError = Object.assign(new Error('Network unavailable'), { code: 'auth/network-request-failed' });
    const place = await importPlaceFromUrl('https://maps.google.com/?q=Cafe', {
      user: { getIdToken: vi.fn().mockRejectedValue(networkError) },
    });
    expect(place).toMatchObject({ source: { canonicalUrl: 'https://maps.google.com/?q=Cafe' }, place: { title: 'Cafe' }, quality: { provenance: 'local_parser' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates an editable transient preview and blocks missing coordinates until selected', () => {
    const preview = normalizeImportPreview({ place: { title: 'Café', address: 'Sevilla' }, provenance: 'metadata' });
    const edited = { ...updateImportPreview(preview, { title: 'Café nuevo', lat: 1 }), duplicate: { status: 'none' } };

    expect(edited.place).toMatchObject({ title: 'Café nuevo', lat: '', lng: '' });
    expect(canConfirmImportPreview(edited)).toMatchObject({ allowed: false, reason: 'MISSING_COORDINATES' });
    expect(applyPreviewCoordinates(edited, { lat: 37.38, lng: -5.99 })).toMatchObject({ quality: { coordinateQuality: 'exact' }, place: { lat: 37.38, lng: -5.99 } });
  });

  it('requires acknowledgments only for ambiguous or approximate warnings and clears stale ones after edits', () => {
    const preview = normalizeImportPreview({ place: { title: 'Café', lat: 1, lng: 2 }, coordinateQuality: 'approximate', ambiguity: true });
    const acknowledged = { ...preview, acknowledgedWarnings: ['AMBIGUOUS_MATCH', 'APPROXIMATE_COORDINATES'], duplicate: { status: 'none' } };

    expect(canConfirmImportPreview(acknowledged)).toEqual({ allowed: true, reason: '' });
    expect(updateImportPreview(acknowledged, { address: 'Otra dirección' }).acknowledgedWarnings).toEqual([]);
  });

  it('replaces wrong coordinates through place search and clears stale acknowledgements', () => {
    const preview = {
      ...normalizeImportPreview({ place: { title: 'Café', lat: 40.4, lng: -3.7 }, coordinateQuality: 'approximate' }),
      acknowledgedWarnings: ['APPROXIMATE_COORDINATES'],
      duplicate: { status: 'possible' },
    };

    expect(applyPreviewCoordinates(preview, { lat: 37.38, lng: -5.99 })).toMatchObject({
      place: { lat: 37.38, lng: -5.99 },
      quality: { coordinateQuality: 'exact', provenance: 'place_search' },
      acknowledgedWarnings: [],
      duplicate: { status: 'unchecked' },
    });
  });
});
