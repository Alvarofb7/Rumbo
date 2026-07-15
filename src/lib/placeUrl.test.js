import { describe, expect, it } from 'vitest';
import { getSafeExternalPlaceUrl, isSafeSupportedPlaceUrl, normalizeSupportedPlaceUrl } from './placeUrl';

describe('place URL validation', () => {
  it('normalizes supported HTTPS place sources', () => {
    expect(normalizeSupportedPlaceUrl('maps.app.goo.gl/example')).toBe('https://maps.app.goo.gl/example');
    expect(normalizeSupportedPlaceUrl('https://www.tripadvisor.es/Restaurant_Review-x')).toContain('tripadvisor.es');
    expect(isSafeSupportedPlaceUrl('https://maps.apple.com/?q=Cafe')).toBe(true);
    expect(getSafeExternalPlaceUrl('maps.apple.com/?q=Cafe')).toBe('https://maps.apple.com/?q=Cafe');
  });

  it.each(['http://maps.google.com/?q=Cafe', 'https://maps.apple.com:444/', 'https://user@maps.apple.com/', 'https://example.com/', 'https://instagram.com.evil.test/', 'https://maps.google.com.evil.test/', 'https://google.evil/maps'])(
    'rejects unsafe or unsupported URLs: %s',
    (url) => expect(() => normalizeSupportedPlaceUrl(url)).toThrow(),
  );

  it('returns an empty external URL rather than propagating unsafe values to anchors', () => {
    expect(getSafeExternalPlaceUrl('javascript:alert(1)')).toBe('');
    expect(getSafeExternalPlaceUrl('https://user@maps.apple.com/')).toBe('');
  });
});
