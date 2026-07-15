import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStorageIssues, getStorageIssues, readStorageJson, removeStorageValue, writeStorageJson } from './storage';

const values = new Map();

beforeEach(() => {
  values.clear();
  clearStorageIssues();
  vi.stubGlobal('localStorage', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
});

describe('safe local storage helpers', () => {
  it('quarantines malformed collections and returns the deterministic fallback', () => {
    values.set('rumbo.places', '{not-json');

    expect(readStorageJson('rumbo.places', [], { validate: Array.isArray, quarantine: true })).toEqual([]);
    expect(values.has('rumbo.places')).toBe(false);
    expect([...values.keys()]).toContainEqual(expect.stringMatching(/^rumbo\.places\.corrupt\./));
    expect(getStorageIssues()[0]).toMatchObject({ operation: 'parse', key: 'rumbo.places' });
  });

  it('turns denied reads, quota writes, and denied removals into diagnostic signals', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('Blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); },
      removeItem: () => { throw new DOMException('Blocked', 'SecurityError'); },
    });

    expect(readStorageJson('rumbo.user', null)).toBeNull();
    expect(writeStorageJson('rumbo.user', { uid: 'demo' })).toBe(false);
    expect(removeStorageValue('rumbo.user')).toBe(false);
    expect(getStorageIssues().map((issue) => issue.operation)).toEqual(expect.arrayContaining(['read', 'write', 'remove']));
  });

  it('keeps malformed data when its quarantine backup cannot be written', () => {
    values.set('rumbo.places', '{not-json');
    vi.stubGlobal('localStorage', { getItem: (key) => values.get(key) ?? null, setItem: () => { throw new DOMException('Quota', 'QuotaExceededError'); }, removeItem: (key) => values.delete(key) });
    expect(readStorageJson('rumbo.places', [], { validate: Array.isArray, quarantine: true })).toEqual([]);
    expect(values.get('rumbo.places')).toBe('{not-json');
  });
});
