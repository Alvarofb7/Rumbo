import { describe, expect, it } from 'vitest';
import { getInitialMapView, getPlacesCenter } from './MapPanel';

describe('map initial location behavior', () => {
  it('uses a neutral country view when no real or saved position exists', () => {
    expect(getInitialMapView({ center: null, userPosition: null, places: [] })).toEqual({
      center: { lat: 40, lng: -3.7, label: 'España' },
      zoom: 6,
    });
  });

  it('prioritizes the real user position and uses a close zoom', () => {
    expect(getInitialMapView({
      center: null,
      userPosition: { lat: 37.3891, lng: -5.9845 },
      places: [{ lat: 41.38, lng: 2.17 }],
    })).toEqual({ center: { lat: 37.3891, lng: -5.9845 }, zoom: 14 });
  });

  it('centers saved places without pretending they are the user location', () => {
    const places = [{ lat: 37.38, lng: -5.99 }, { lat: 37.4, lng: -5.97 }];
    expect(getPlacesCenter(places)).toEqual({ lat: 37.39, lng: -5.98 });
    expect(getInitialMapView({ center: null, userPosition: null, places })).toEqual({
      center: { lat: 37.39, lng: -5.98 },
      zoom: 12,
    });
  });
});
