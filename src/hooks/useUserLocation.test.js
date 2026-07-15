import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistLocationConsent, readLocationConsent } from './useUserLocation';

const source = readFileSync(new URL('./useUserLocation.js', import.meta.url), 'utf8');

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

  it('uses an explicit result shape so consent success is not confused with position availability', () => {
    expect(source).toContain('return { enabled: false, position: null };');
    expect(source).toContain('return { enabled: true, position: livePosition };');
  });

  it('does not expose a fallback city as the current user position', () => {
    expect(source).toContain('const initialPosition = null;');
    expect(source).toContain('currentPositionRef.current = null;');
    expect(source).toContain('setPosition(null);');
  });
});
