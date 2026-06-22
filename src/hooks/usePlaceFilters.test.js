import { describe, expect, it } from 'vitest';
import { filterPlaces } from './usePlaceFilters';

const places = [
  { id: 'one', name: 'Uno', zone: 'Triana', status: 'favorite', rating: 4.5, tags: ['Terraza'], lat: 1, lng: 1 },
  { id: 'two', name: 'Dos', zone: 'Nervión', status: 'wishlist', rating: 3, tags: ['Brunch'], lat: 2, lng: 2 },
];

const defaultFilters = {
  tags: [],
  status: 'all',
  minRating: 0,
  zone: 'all',
  sort: 'nearest',
};

describe('map place filters', () => {
  it('treats all as an explicit empty zone filter', () => {
    expect(filterPlaces(places, defaultFilters, null)).toHaveLength(2);
    expect(filterPlaces(places, { ...defaultFilters, zone: 'Triana' }, null).map((place) => place.id)).toEqual(['one']);
  });

  it('filters by status and selected tags', () => {
    expect(filterPlaces(places, { ...defaultFilters, status: 'favorite' }, null).map((place) => place.id)).toEqual(['one']);
    expect(filterPlaces(places, { ...defaultFilters, tags: ['Brunch'] }, null).map((place) => place.id)).toEqual(['two']);
  });
});
