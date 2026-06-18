import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PWA update strategy', () => {
  it('does not serve API responses from the service worker cache', () => {
    const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorker).toContain("fetch(event.request, { cache: 'no-store' })");
    expect(serviceWorker).not.toContain('rumbo-shell-v1');
  });

  it('forces a fresh worker check and reloads controlled clients', () => {
    const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

    expect(main).toContain("updateViaCache: 'none'");
    expect(main).toContain("addEventListener('controllerchange'");
    expect(main).toContain('window.location.reload()');
  });
});
