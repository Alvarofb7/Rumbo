import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistLocationConsent, readLocationConsent } from './useUserLocation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('location consent persistence', () => {
  it('does not report a consent change when storage rejects the write', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'true'),
      setItem: vi.fn(() => { throw new Error('quota exceeded'); }),
    });

    expect(persistLocationConsent(false)).toBe(false);
    expect(readLocationConsent()).toBe(true);
  });
});
