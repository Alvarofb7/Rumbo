import { describe, expect, it } from 'vitest';
import {
  categoryFromGoogleType,
  getPlaceRecordMigration,
  normalizePlaceRating,
  sanitizePlaceRecord,
  tagsFromGoogleTypes,
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
    expect(categoryFromGoogleType('sushi_restaurant')).toBe('restaurant');
    expect(categoryFromGoogleType('barbecue_restaurant')).toBe('restaurant');
    expect(categoryFromGoogleType('seafood_restaurant')).toBe('restaurant');
    expect(tagsFromGoogleTypes(['sushi_restaurant', 'barbecue_restaurant', 'sushi_restaurant'])).toEqual(['Sushi', 'Japonés', 'Carne', 'Parrilla']);
    expect(categoryFromGoogleType('coffee_shop')).toBe('cafe');
    expect(categoryFromGoogleType('museum')).toBe('other');
  });

  it('keeps food specialities as personal tags instead of place types', () => {
    expect(sanitizePlaceRecord({ name: 'Omakase sushi barato para cita', tags: ['Sushi', 'Barato', 'Cita'] })).toMatchObject({
      category: 'restaurant',
      tags: ['Sushi', 'Barato', 'Cita'],
    });
    expect(sanitizePlaceRecord({ name: 'Restaurante pendiente', category: 'restaurant', tags: ['Sushi', 'Barato', 'sushi'] }).tags).toEqual([
      'Sushi',
      'Barato',
    ]);
    expect(sanitizePlaceRecord({ name: 'Asador antiguo', category: 'grill', tags: ['Caro'] })).toMatchObject({
      category: 'restaurant',
      tags: ['Carne', 'Parrilla', 'Caro'],
    });
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
      id: 'duplicated-legacy-id',
    };

    expect(sanitizePlaceRecord(legacy)).toEqual({
      id: 'duplicated-legacy-id',
      name: 'Café antiguo',
      category: 'cafe',
      tags: ['Trabajo'],
    });
    expect(getPlaceRecordMigration(legacy)).toEqual({
      remove: ['imageUrl', 'notes', 'id'],
      set: { category: 'cafe', tags: ['Trabajo'] },
    });
  });
});
