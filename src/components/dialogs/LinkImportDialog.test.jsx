// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinkImportDialog from './LinkImportDialog';

vi.mock('../../lib/googlePlaces', () => ({
  createPlaceSearchSession: () => ({}),
  searchLocation: vi.fn().mockResolvedValue([{ id: 'cafe', name: 'Café corregido', address: 'Sevilla' }]),
  resolveLocationSuggestion: vi.fn().mockResolvedValue({ lat: 37.38, lng: -5.99 }),
}));

afterEach(cleanup);

function preview(overrides = {}) {
  return {
    source: { provider: 'google', inputUrl: 'https://maps.google.com/?q=Cafe', canonicalUrl: 'https://maps.google.com/?q=Cafe', resolvedUrl: 'https://maps.google.com/?q=Cafe', providerId: 'cafe-1' },
    place: { title: 'Café', address: 'Sevilla', zone: '', category: 'coffee', tags: [], rating: 4, lat: 37.38, lng: -5.99 },
    quality: { confidence: 'medium', coordinateQuality: 'approximate', provenance: 'metadata', warnings: ['APPROXIMATE_COORDINATES'], ambiguity: false },
    duplicate: { status: 'none', matchedCollection: null, matchedId: null, reasons: [] },
    ...overrides,
  };
}

describe('link import preview dialog', () => {
  it('requires acknowledgement, clears it after an edit, and hands off complete preview metadata once', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<LinkImportDialog open onClose={vi.fn()} onImport={vi.fn().mockResolvedValue(preview())} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText('Enlace'), 'https://maps.google.com/?q=Cafe');
    await user.click(screen.getByRole('button', { name: 'Analizar enlace' }));
    expect(await screen.findByText(/Metadatos · confianza media · coordenadas aproximadas/)).toBeTruthy();

    const confirm = screen.getByRole('button', { name: 'Enviar a revisión' });
    expect(confirm.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox'));
    expect(confirm.disabled).toBe(false);
    await user.clear(screen.getByLabelText('Dirección'));
    await user.type(screen.getByLabelText('Dirección'), 'Triana');
    expect(confirm.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox'));
    await user.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      source: { provider: 'google', providerId: 'cafe-1' },
      place: { address: 'Triana' },
      quality: { coordinateQuality: 'approximate', warnings: ['APPROXIMATE_COORDINATES'] },
      acknowledgedWarnings: ['APPROXIMATE_COORDINATES'],
      duplicate: { status: 'none' },
    });
  });

  it('corrects missing coordinates through search, recomputes duplicates, and does not call confirmation after discard', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onRecomputeDuplicate = vi.fn().mockReturnValue({ status: 'possible', matchedCollection: 'saved', matchedId: 'saved-cafe', reasons: ['nearbyName'] });
    render(<LinkImportDialog open onClose={vi.fn()} onImport={vi.fn().mockResolvedValue(preview({ place: { ...preview().place, lat: '', lng: '' }, quality: { confidence: 'low', coordinateQuality: 'missing', provenance: 'metadata', warnings: ['MISSING_COORDINATES'] } }))} onConfirm={onConfirm} onRecomputeDuplicate={onRecomputeDuplicate} />);

    await user.type(screen.getByLabelText('Enlace'), 'https://maps.google.com/?q=Cafe');
    await user.click(screen.getByRole('button', { name: 'Analizar enlace' }));
    expect(await screen.findByText('Faltan coordenadas. Busca y selecciona el lugar para corregirlas.')).toBeTruthy();
    await user.type(screen.getByLabelText('Buscar ubicación'), 'Café');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('button', { name: /Café corregido/ }));

    expect(await screen.findByText(/Búsqueda de lugar · confianza baja · coordenadas exactas/)).toBeTruthy();
    expect(onRecomputeDuplicate).toHaveBeenCalled();
    expect(screen.getByText('Posible duplicado en lugares guardados.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps the dialog retryable after import failure and expires stale previews without handoff', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn()
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce(preview({ expiresAt: Date.now() - 1, quality: { confidence: 'high', coordinateQuality: 'exact', provenance: 'official_api', warnings: [] } }));
    const onConfirm = vi.fn();
    render(<LinkImportDialog open onClose={vi.fn()} onImport={onImport} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText('Enlace'), 'https://maps.google.com/?q=Cafe');
    await user.click(screen.getByRole('button', { name: 'Analizar enlace' }));
    expect(await screen.findByText('Sin conexión')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Analizar enlace' }));
    await user.click(await screen.findByRole('button', { name: 'Enviar a revisión' }));

    expect(await screen.findByText('La vista previa ha caducado. Analiza el enlace de nuevo.')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits a rendered confirmation form once while the handoff is pending', async () => {
    const user = userEvent.setup();
    let resolveConfirmation;
    const onConfirm = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveConfirmation = resolve; }));
    render(<LinkImportDialog open onClose={vi.fn()} onImport={vi.fn().mockResolvedValue(preview({ quality: { confidence: 'high', coordinateQuality: 'exact', provenance: 'official_api', warnings: [] } }))} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText('Enlace'), 'https://maps.google.com/?q=Cafe');
    await user.click(screen.getByRole('button', { name: 'Analizar enlace' }));
    const form = screen.getByRole('button', { name: 'Enviar a revisión' }).closest('form');
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    resolveConfirmation();
  });

  it('allows a user to correct approximate coordinates through place search', async () => {
    const user = userEvent.setup();
    render(<LinkImportDialog open onClose={vi.fn()} onImport={vi.fn().mockResolvedValue(preview())} onConfirm={vi.fn()} />);

    await user.type(screen.getByLabelText('Enlace'), 'https://maps.google.com/?q=Cafe');
    await user.click(screen.getByRole('button', { name: 'Analizar enlace' }));
    await user.type(screen.getByLabelText('Buscar ubicación'), 'Café');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('button', { name: /Café corregido/ }));

    expect(await screen.findByText(/Búsqueda de lugar · confianza media · coordenadas exactas/)).toBeTruthy();
  });

  it('renders informational warnings, ambiguity quality, and an explicit no-duplicate status', async () => {
    const user = userEvent.setup();
    render(<LinkImportDialog open onClose={vi.fn()} onImport={vi.fn().mockResolvedValue(preview({ quality: { confidence: 'medium', coordinateQuality: 'exact', provenance: 'metadata', warnings: ['METADATA_ONLY', 'LOCAL_FALLBACK'], ambiguity: true } }))} onConfirm={vi.fn()} />);

    await user.type(screen.getByLabelText('Enlace'), 'https://maps.google.com/?q=Cafe');
    await user.click(screen.getByRole('button', { name: 'Analizar enlace' }));

    expect(await screen.findByText('METADATA_ONLY')).toBeTruthy();
    expect(screen.getByText('LOCAL_FALLBACK')).toBeTruthy();
    expect(screen.getByText('Coincidencia ambigua')).toBeTruthy();
    expect(screen.getByText('Sin duplicados detectados.')).toBeTruthy();
  });
});
