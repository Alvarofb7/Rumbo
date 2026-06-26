import { describe, expect, it } from 'vitest';
import { buildDirectionsUrl, getDeviceMapProvider, resolveMapProvider } from './mapDirections';

const place = {
  name: 'Bar Moli',
  lat: 37.3469,
  lng: -5.9801,
  providerPlaceId: 'google-place-id',
};

describe('map directions', () => {
  it('uses Google Maps for Android and Windows, and Apple Maps for Apple devices', () => {
    expect(getDeviceMapProvider({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel)', platform: 'Linux armv8l' })).toBe('google');
    expect(getDeviceMapProvider({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' })).toBe('google');
    expect(getDeviceMapProvider({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)', platform: 'iPhone' })).toBe('apple');
    expect(getDeviceMapProvider({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)', platform: 'MacIntel' })).toBe('apple');
  });

  it('defaults non-Apple devices to Google Maps', () => {
    expect(resolveMapProvider({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' })).toBe('google');
  });

  it('builds Google Maps directions with place id when available', () => {
    const windowsNavigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' };
    const { provider, url } = buildDirectionsUrl(place, windowsNavigator);

    expect(provider).toBe('google');
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=Bar+Moli&destination_place_id=google-place-id');
  });

  it('keeps Apple Maps as the iPhone directions URL', () => {
    const iphoneNavigator = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)', platform: 'iPhone' };
    const { provider, url } = buildDirectionsUrl(place, iphoneNavigator);

    expect(provider).toBe('apple');
    expect(url).toBe('https://maps.apple.com/?daddr=37.3469,-5.9801&q=Bar%20Moli');
  });
});
