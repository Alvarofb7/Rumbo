import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Firestore emulator artifact verification', () => {
  it('pins the downloaded emulator to its expected SHA-256', () => {
    const source = readFileSync(new URL('./run-firestore-rules-tests.js', import.meta.url), 'utf8');
    expect(source).toContain("EMULATOR_SHA256 = '9d43599ed6151199e8d604dc87fac51218e49e5f3a48519b1ae560bbe5e3382d'");
    expect(source).toContain("createHash('sha256')");
  });
});
