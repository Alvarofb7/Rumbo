import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createToast } from './AppToast';

describe('structured app toasts', () => {
  it('preserves semantic severity and delete undo metadata', () => {
    expect(createToast('No se ha podido guardar.', 'error')).toEqual({
      message: 'No se ha podido guardar.',
      severity: 'error',
      undoDelete: false,
    });
    expect(createToast('Lugar eliminado.', 'success', { undoDelete: true })).toEqual({
      message: 'Lugar eliminado.',
      severity: 'success',
      undoDelete: true,
    });
  });

  it('passes the structured severity directly to MUI Alert', () => {
    const source = readFileSync(new URL('./AppToast.jsx', import.meta.url), 'utf8');
    expect(source).toContain('severity={toast.severity}');
    expect(source).toContain('toast.undoDelete');
  });
});
