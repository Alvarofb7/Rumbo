import { describe, expect, it } from 'vitest';
import { normalizeImportPreview } from './importPreview.js';
import { normalizeImportedPlace } from './placeData.js';

describe('import preview normalization', () => {
  it('creates the canonical exact preview contract without editable coordinates', () => {
    const preview = normalizeImportPreview({
      source: { provider: 'google', inputUrl: 'https://maps.google.com/?q=Cafe', canonicalUrl: 'https://maps.google.com/?q=Cafe' },
      place: { title: 'Café Norte', address: 'Calle Norte 1', lat: 37.39, lng: -5.99, category: 'cafe', tags: ['Terraza'], rating: 4.5 },
      provenance: 'official_api',
    });

    expect(preview).toMatchObject({
      source: { provider: 'google' },
      place: { title: 'Café Norte', lat: 37.39, lng: -5.99 },
      quality: { confidence: 'high', coordinateQuality: 'exact', provenance: 'official_api', warnings: [], ambiguity: false },
      duplicate: { status: 'unchecked', matchedCollection: null, matchedId: null, reasons: [] },
    });
    expect(preview.editableFields).toEqual(['title', 'address', 'zone', 'category', 'tags', 'rating']);
  });

  it('labels missing or approximate coordinates honestly and never verifies low-confidence output', () => {
    expect(normalizeImportPreview({ place: { title: 'Sin coordenadas' }, provenance: 'metadata' })).toMatchObject({
      quality: { confidence: 'low', coordinateQuality: 'missing', warnings: ['MISSING_COORDINATES', 'METADATA_ONLY'], verified: false },
    });
    expect(normalizeImportPreview({ place: { title: 'Aproximado', lat: 1, lng: 2 }, provenance: 'geocoder', coordinateQuality: 'approximate', ambiguity: true })).toMatchObject({
      quality: { confidence: 'low', coordinateQuality: 'approximate', warnings: ['AMBIGUOUS_MATCH', 'APPROXIMATE_COORDINATES'], verified: false },
    });
  });

  it('keeps local and server normalization parity through normalizeImportedPlace', () => {
    const preview = normalizeImportPreview({ source: { provider: 'google' }, place: { title: 'Café', lat: 1, lng: 2 }, provenance: 'official_api' });
    expect(normalizeImportedPlace(preview)).toMatchObject({ title: 'Café', name: 'Café', source: preview.source, duplicate: preview.duplicate, editableFields: preview.editableFields });
  });
});
