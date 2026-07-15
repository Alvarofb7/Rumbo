import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getNextActiveIndex, getSearchOptionId } from './MapSearch';

describe('map search combobox behavior', () => {
  it('wraps ArrowUp and ArrowDown navigation deterministically', () => {
    expect(getNextActiveIndex(-1, 3, 'down')).toBe(0);
    expect(getNextActiveIndex(2, 3, 'down')).toBe(0);
    expect(getNextActiveIndex(0, 3, 'up')).toBe(2);
    expect(getNextActiveIndex(1, 0, 'up')).toBe(-1);
  });

  it('creates stable DOM-safe option ids', () => {
    expect(getSearchOptionId('places', { id: 'ChIJ:123' }, 0)).toBe('places-option-ChIJ-123');
  });

  it('implements the ARIA combobox/listbox contract and iPhone input sizing', () => {
    const source = readFileSync(new URL('./MapSearch.jsx', import.meta.url), 'utf8');
    for (const token of ["role: 'combobox'", "'aria-expanded'", "'aria-controls'", "'aria-autocomplete': 'list'", "'aria-activedescendant'", 'role="listbox"', 'role="option"', "event.key === 'ArrowDown'", "event.key === 'ArrowUp'", "event.key === 'Enter'", "event.key === 'Escape'", 'fontSize: 16']) {
      expect(source).toContain(token);
    }
    expect(source).toContain('onMouseDown={(event) => event.preventDefault()}');
  });
});
