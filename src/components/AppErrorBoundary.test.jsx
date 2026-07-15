import { describe, expect, it } from 'vitest';
import { AppErrorBoundary, deriveErrorBoundaryState } from './AppErrorBoundary';

describe('AppErrorBoundary recovery state', () => {
  it('shows the fallback state after an error and clears it when the authenticated shell changes', () => {
    const failed = AppErrorBoundary.getDerivedStateFromError(new Error('render failed'));
    expect(failed).toMatchObject({ hasError: true, error: expect.any(Error) });
    expect(deriveErrorBoundaryState({ resetKey: 'user-b' }, { ...failed, resetKey: 'user-a' })).toEqual({
      hasError: false,
      error: null,
      resetKey: 'user-b',
    });
  });

  it('keeps a healthy shell mounted without a permanent fallback', () => {
    expect(deriveErrorBoundaryState({ resetKey: 'user-a' }, { hasError: false, error: null, resetKey: 'user-a' })).toBeNull();
  });
});
