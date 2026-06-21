import { describe, expect, it } from 'vitest';
import { findNearestPlace } from './geo';

describe('findNearestPlace', () => {
  it('prioritizes the nearest saved place when Firestore coordinates are strings', () => {
    const places = [
      { id: 'far', lat: '37.3905', lng: '-5.9963' },
      { id: 'seis', lat: '37.388284', lng: '-5.9963695' },
    ];

    expect(findNearestPlace({ lat: 37.388284, lng: -5.9963695 }, places, 90)).toBe(places[1]);
  });

  it('returns no saved place outside the tap radius', () => {
    const places = [{ id: 'far', lat: 37.3905, lng: -5.9963 }];

    expect(findNearestPlace({ lat: 37.388284, lng: -5.9963695 }, places, 90)).toBeNull();
  });
});
