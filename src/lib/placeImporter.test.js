import { describe, expect, it, vi } from 'vitest';
import { importPlaceFromUrl } from './placeImporter';

describe('local link import', () => {
  it('parses supported links locally without fetching or requiring Firebase authentication', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const place = await importPlaceFromUrl('https://maps.google.com/?q=Cafe', { user: { isLocal: true } });
    expect(place.sourceUrl).toBe('https://maps.google.com/?q=Cafe');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the validated local parser for authenticated upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'temporarily unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })));
    const place = await importPlaceFromUrl('https://maps.google.com/?q=Cafe', { user: { getIdToken: vi.fn().mockResolvedValue('token') } });
    expect(place).toMatchObject({ title: 'Cafe', sourceUrl: 'https://maps.google.com/?q=Cafe' });
  });

  it('does not bypass authenticated authorization failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'content-type': 'application/json' } })));
    await expect(importPlaceFromUrl('https://maps.google.com/?q=Cafe', { user: { getIdToken: vi.fn().mockResolvedValue('token') } })).rejects.toThrow('No autorizado');
  });
});
