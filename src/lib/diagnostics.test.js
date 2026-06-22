import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDiagnosticsReport, captureDiagnostic, clearDiagnostics, getDiagnostics, recordBreadcrumb } from './diagnostics';

const values = new Map();

beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
});

describe('client diagnostics', () => {
  it('stores compact incidents without product data', () => {
    captureDiagnostic('place.save', new Error('No se pudo guardar'), { operation: 'create' });

    expect(getDiagnostics()).toMatchObject([
      {
        area: 'place.save',
        message: 'No se pudo guardar',
        context: { operation: 'create' },
        count: 1,
      },
    ]);
  });

  it('deduplicates repeated incidents and clears the report', () => {
    captureDiagnostic('map.load', new Error('Maps unavailable'));
    captureDiagnostic('map.load', new Error('Maps unavailable'));
    recordBreadcrumb('map.click', { hasPlaceId: true });

    expect(getDiagnostics()).toHaveLength(1);
    expect(getDiagnostics()[0].count).toBe(2);
    expect(buildDiagnosticsReport().diagnosticVersion).toBe(1);
    expect(buildDiagnosticsReport().breadcrumbs[0]).toMatchObject({ area: 'map.click', context: { hasPlaceId: true } });

    clearDiagnostics();
    expect(getDiagnostics()).toEqual([]);
  });
});
