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
});
