import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPlaceValidationErrors } from './PlaceDialog';

describe('place dialog mobile accessibility', () => {
  it('reports save prerequisites instead of silently disabling submit', () => {
    expect(getPlaceValidationErrors({ name: '', lat: '', lng: '' })).toEqual({
      location: 'Elige un resultado de ubicación antes de guardar.',
      name: 'Añade un nombre para guardar el lugar.',
    });
    expect(getPlaceValidationErrors({ name: 'Casa', lat: 37.3, lng: -5.9 })).toEqual({ location: '', name: '' });
  });

  it('keeps the full-screen header safe and status controls touch accessible', () => {
    const source = readFileSync(new URL('./PlaceDialog.jsx', import.meta.url), 'utf8');
    expect(source).toContain('env(safe-area-inset-top)');
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('role="radio"');
    expect(source).toContain('aria-checked={selected}');
    expect(source).toContain('minHeight: 44');
    expect(source).toContain('nameInputRef.current?.focus()');
    expect(source).not.toContain('disabled={!draft.name.trim()');
    expect(source).toContain('formErrors.sourceUrl');
    expect(source).toContain('disabled={saving}');
  });
});
