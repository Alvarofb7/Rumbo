import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGoogleMaps, resetGoogleMapsLoaderForTests } from './googleMaps';

function installDocument() {
  const scripts = [];
  vi.stubGlobal('document', {
    createElement: () => ({ remove: vi.fn(), dataset: {} }),
    head: { append: vi.fn((script) => scripts.push(script)) },
  });
  return scripts;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  delete window.google;
  delete window.__rumboGoogleMapsReady;
  resetGoogleMapsLoaderForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Google Maps loader', () => {
  it('times out, cleans its owned state, and permits a retry', async () => {
    const scripts = installDocument();
    const first = loadGoogleMaps({ timeoutMs: 25, apiKey: 'test-key' });
    const timedOut = expect(first).rejects.toThrow('tardó demasiado');
    await vi.advanceTimersByTimeAsync(25);

    await timedOut;
    expect(scripts[0].remove).toHaveBeenCalledOnce();
    expect(window.__rumboGoogleMapsReady).toBeUndefined();

    const second = loadGoogleMaps({ timeoutMs: 25, apiKey: 'test-key' });
    expect(second).not.toBe(first);
    window.google = { maps: { importLibrary: vi.fn() } };
    window.__rumboGoogleMapsReady();
    await expect(second).resolves.toBe(window.google.maps);
    expect(scripts[1].remove).not.toHaveBeenCalled();
  });

  it('shares one script request between concurrent callers', async () => {
    const scripts = installDocument();
    const first = loadGoogleMaps({ apiKey: 'test-key' });
    const second = loadGoogleMaps({ apiKey: 'test-key' });

    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);
    window.google = { maps: { importLibrary: vi.fn() } };
    window.__rumboGoogleMapsReady();
    await expect(first).resolves.toBe(window.google.maps);
  });
});
