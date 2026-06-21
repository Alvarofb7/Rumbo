import { describe, expect, it } from 'vitest';
import {
  categoryFromGoogleType,
  getPlaceRecordMigration,
  normalizePlaceRating,
  sanitizePlaceRecord,
} from './placeData';

describe('place data normalization', () => {
  it('separates category from personal tags', () => {
    const place = sanitizePlaceRecord({
      name: 'Bar de prueba',
      tags: ['Bar', 'Favorito', 'Terraza', 'terraza'],
    });

    expect(place.category).toBe('bar');
    expect(place.tags).toEqual(['Terraza']);
  });

  it('maps Google place types to a stable category', () => {
    expect(categoryFromGoogleType('restaurant')).toBe('restaurant');
    expect(categoryFromGoogleType('coffee_shop')).toBe('cafe');
    expect(categoryFromGoogleType('museum')).toBe('culture');
  });

  it('keeps explicit categories and normalizes personal ratings', () => {
    expect(sanitizePlaceRecord({ name: 'Bar de prueba', category: 'other', tags: [] }).category).toBe('other');
    expect(normalizePlaceRating(4.5)).toBe(4.5);
    expect(normalizePlaceRating(4.7)).toBe(4.5);
    expect(normalizePlaceRating(9)).toBe(5);
  });

  it('removes legacy photos and notes from records and migration patches', () => {
    const legacy = {
      name: 'Café antiguo',
      tags: ['Café', 'Trabajo'],
      imageUrl: 'data:image/jpeg;base64,legacy',
      notes: 'Texto antiguo',
    };

    expect(sanitizePlaceRecord(legacy)).toEqual({
      name: 'Café antiguo',
      category: 'cafe',
      tags: ['Trabajo'],
    });
    expect(getPlaceRecordMigration(legacy)).toEqual({
      remove: ['imageUrl', 'notes'],
      set: { category: 'cafe', tags: ['Trabajo'] },
    });
  });
});
