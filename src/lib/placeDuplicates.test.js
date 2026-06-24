import { describe, expect, it } from 'vitest';
import { findDuplicatePlace, getDuplicateMatch } from './placeDuplicates';

const savedPlaces = [
  {
    id: 'moli',
    name: 'Bar Moli Bermejales',
    address: 'Av. de Finlandia, Sevilla',
    lat: 37.3469,
    lng: -5.9818,
    providerPlaceId: 'google-moli',
    sourceUrl: 'https://maps.google.com/?q=Bar+Moli',
  },
  {
    id: 'next-door',
    name: 'Sushi Sakura',
    address: 'Av. de Finlandia, Sevilla',
    lat: 37.34692,
    lng: -5.98178,
    providerPlaceId: 'google-sakura',
  },
];

describe('place duplicate detection', () => {
  it('matches exact provider ids and source links', () => {
    expect(getDuplicateMatch({ providerPlaceId: 'google-moli' }, savedPlaces[0])).toBe('providerPlaceId');
    expect(getDuplicateMatch({ sourceUrl: 'https://maps.google.com/?q=Bar+Moli&utm_source=test' }, savedPlaces[0])).toBe('sourceUrl');
  });

  it('matches similar names when coordinates are nearby', () => {
    const candidate = { name: 'Bar Moli', lat: 37.34695, lng: -5.98184 };

    expect(findDuplicatePlace(candidate, savedPlaces)?.id).toBe('moli');
  });

  it('ignores the current record and nearby places with different names', () => {
    expect(findDuplicatePlace({ id: 'moli', name: 'Bar Moli', providerPlaceId: 'google-moli' }, savedPlaces, { excludeId: 'moli' })).toBeNull();
    expect(findDuplicatePlace({ name: 'Heladería Nueva', lat: 37.34691, lng: -5.98179 }, savedPlaces)).toBeNull();
    expect(findDuplicatePlace({ name: 'Heladería Nueva', address: 'Av. de Finlandia, Sevilla', lat: 37.34691, lng: -5.98179 }, savedPlaces)).toBeNull();
  });
});
