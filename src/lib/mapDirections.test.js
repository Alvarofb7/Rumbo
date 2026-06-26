import { describe, expect, it } from 'vitest';
import { buildDirectionsUrl, getDeviceMapProvider, normalizeMapProviderPreference, resolveMapProvider } from './mapDirections';

const place = {
  name: 'Bar Moli',
  lat: 37.3469,
  lng: -5.9801,
  providerPlaceId: 'google-place-id',
};

describe('map directions', () => {
  it('detects Android as Google Maps and iPhone as Apple Maps', () => {
    expect(getDeviceMapProvider({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel)', platform: 'Linux armv8l' })).toBe('google');
    expect(getDeviceMapProvider({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)', platform: 'iPhone' })).toBe('apple');
  });

  it('normalizes map provider preferences', () => {
    expect(normalizeMapProviderPreference('google')).toBe('google');
    expect(normalizeMapProviderPreference('apple')).toBe('apple');
    expect(normalizeMapProviderPreference('unknown')).toBe('auto');
  });

  it('respects manual provider preference over automatic device detection', () => {
    const androidNavigator = { userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux' };

    expect(resolveMapProvider('auto', androidNavigator)).toBe('google');
    expect(resolveMapProvider('apple', androidNavigator)).toBe('apple');
  });

  it('builds Google Maps directions with place id when available', () => {
    const { provider, url } = buildDirectionsUrl(place, 'google');

    expect(provider).toBe('google');
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=Bar+Moli&destination_place_id=google-place-id');
  });

  it('keeps Apple Maps as the iPhone directions URL', () => {
    const { provider, url } = buildDirectionsUrl(place, 'apple');

    expect(provider).toBe('apple');
    expect(url).toBe('https://maps.apple.com/?daddr=37.3469,-5.9801&q=Bar%20Moli');
  });
});
