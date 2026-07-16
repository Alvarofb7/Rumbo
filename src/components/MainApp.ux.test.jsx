// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const durableImport = vi.hoisted(() => ({
  inboxAddItem: vi.fn(),
  retrySync: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'user-1' }, loading: false }) }));
vi.mock('../hooks/useFirestoreCollection', () => ({
  useUserCollection: (_user, collectionName) => ({
    items: [],
    loading: false,
    addItem: collectionName === 'inbox' ? durableImport.inboxAddItem : vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    convertInboxToPlace: vi.fn(),
    retrySync: durableImport.retrySync,
    syncState: { status: 'synced', pending: false, offline: false, error: '' },
  }),
}));
vi.mock('../hooks/usePlaceFilters', () => ({ usePlaceFilters: (items) => items }));
vi.mock('../hooks/useUserLocation', () => ({
  useUserLocation: () => ({ position: null, status: 'ready', error: '', consent: true, setManualPosition: vi.fn(), requestLivePosition: vi.fn(), enableLocation: vi.fn(), disableLocation: vi.fn() }),
}));
vi.mock('../lib/googlePlaces', () => ({ createPlaceSearchSession: vi.fn(), resolveGooglePlaceAt: vi.fn(), resolveGooglePlaceId: vi.fn(), resolveLocationSuggestion: vi.fn(), searchLocation: vi.fn() }));
vi.mock('../lib/geo', () => ({ findNearestPlace: vi.fn() }));
vi.mock('../lib/diagnostics', () => ({ captureDiagnostic: vi.fn(), recordBreadcrumb: vi.fn() }));
vi.mock('../lib/placeImporter', () => ({
  importPlaceFromUrl: vi.fn(async () => ({
    place: { title: 'Imported place', address: '', zone: '', category: 'other', tags: [], rating: 0 },
    source: { provider: 'google', canonicalUrl: 'https://maps.google.com/example', resolvedUrl: '', providerId: 'place-1' },
    quality: { warnings: [] },
    acknowledgedWarnings: [],
  })),
}));
vi.mock('../lib/placeDuplicates', () => ({ findDuplicatePlace: vi.fn(), getImportDuplicate: vi.fn(() => ({ status: 'none' })) }));
vi.mock('../lib/placeData', () => ({ getPlaceRecordMigration: vi.fn(), sanitizePlaceRecord: (value) => value }));
vi.mock('../lib/mapDirections', () => ({ buildDirectionsUrl: vi.fn() }));
vi.mock('./filters/FilterDrawer', () => ({ default: () => null }));
vi.mock('./panels/InboxPanel', () => ({ default: () => null }));
vi.mock('./map/MapPanel', () => ({ default: () => null }));
vi.mock('./map/MapSearch', async () => {
  const React = await import('react');
  return { default: ({ onMenuOpen }) => React.createElement('button', { type: 'button', onClick: onMenuOpen, 'aria-label': 'Open menu' }, 'Open menu') };
});
vi.mock('./dialogs/PlaceDialog', () => ({ default: () => null }));
vi.mock('./panels/PlacesPanel', () => ({ default: () => null }));
vi.mock('./cards/GooglePlaceCard', () => ({ default: () => null }));
vi.mock('./cards/SelectedPlaceCard', () => ({ default: () => null }));
vi.mock('./navigation/AppMenuDrawer', async () => {
  const React = await import('react');
  return { default: ({ onClose, onImportLink }) => React.createElement('button', { type: 'button', onClick: () => { onImportLink(); onClose(); } }, 'Import link') };
});
vi.mock('./feedback/AppToast', () => ({ default: () => null, createToast: (message, severity) => ({ message, severity }) }));
vi.mock('./privacy/LocationPrivacy', () => ({ LocationConsentDialog: () => null }));
vi.mock('./dialogs/LinkImportDialog', async () => {
  const React = await import('react');
  return {
    default: function MockLinkImportDialog({ open, onClose, onConfirm, onImport }) {
      const [pending, setPending] = React.useState(false);
      const [error, setError] = React.useState('');
      const [preview, setPreview] = React.useState(null);
      React.useEffect(() => {
        if (!open) {
          setPreview(null);
          return;
        }
        if (!preview) void onImport('https://maps.google.com/example').then(setPreview);
      }, [onImport, open, preview]);
      if (!open || !preview) return null;
      const confirm = async () => {
        setPending(true);
        setError('');
        try {
          await onConfirm(preview);
          setPreview(null);
          onClose();
        } catch (failure) {
          setError(failure.message);
        } finally {
          setPending(false);
        }
      };
      return React.createElement('section', { 'aria-label': 'Import preview' },
        React.createElement('input', { 'aria-label': 'Preview title', defaultValue: preview.place.title }),
        error ? React.createElement('div', { role: 'alert' }, `Retryable failure: ${error}`) : null,
        React.createElement('button', { type: 'button', onClick: confirm, disabled: pending }, pending ? 'Confirming import' : 'Confirm import'),
      );
    },
  };
});

import MainApp from './MainApp';

afterEach(() => cleanup());

const mainSource = readFileSync('src/components/MainApp.jsx', 'utf8');
const locationSource = readFileSync('src/hooks/useUserLocation.js', 'utf8');
const privacySource = readFileSync('src/components/privacy/LocationPrivacy.jsx', 'utf8');
const firestoreSource = readFileSync('src/hooks/useFirestoreCollection.js', 'utf8');
const authSource = readFileSync('src/context/AuthContext.jsx', 'utf8');

describe('remaining UX and privacy integrations', () => {
  it('keeps an import preview editable through a retryable durable failure and confirms exactly once', async () => {
    let rejectFirst;
    durableImport.inboxAddItem.mockReset();
    durableImport.inboxAddItem
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce({ id: 'inbox-1', committed: true });

    render(<MainApp />);
    fireEvent.click(screen.getByLabelText('Open menu'));
    fireEvent.click(screen.getByText('Import link'));

    const confirm = await screen.findByRole('button', { name: 'Confirm import' });
    fireEvent.click(confirm);
    expect(screen.getByRole('button', { name: 'Confirming import' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Confirming import' }));
    expect(durableImport.inboxAddItem).toHaveBeenCalledTimes(1);

    rejectFirst(new Error('unavailable'));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Preview title').disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Confirm import' }).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    await waitFor(() => expect(screen.queryByLabelText('Import preview')).toBeNull());
    expect(durableImport.inboxAddItem).toHaveBeenCalledTimes(2);
    expect(durableImport.inboxAddItem).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ durable: true }));
    const retryKeys = durableImport.inboxAddItem.mock.calls.map(([, options]) => options.idempotencyKey);
    expect(retryKeys[0]).toMatch(/^import_[A-Za-z0-9_-]{16,}$/);
    expect(retryKeys[1]).toBe(retryKeys[0]);
  });

  it('gives a separate preview an independent durable idempotency key', async () => {
    durableImport.inboxAddItem.mockReset().mockResolvedValue({ id: 'inbox-1', committed: true });
    render(<MainApp />);

    fireEvent.click(screen.getByLabelText('Open menu'));
    fireEvent.click(screen.getByText('Import link'));
    fireEvent.click(await screen.findByText('Confirm import'));
    await waitFor(() => expect(screen.queryByLabelText('Import preview')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.click(screen.getByLabelText('Open menu'));
    fireEvent.click(screen.getByText('Import link'));
    fireEvent.click(await screen.findByText('Confirm import'));
    await waitFor(() => expect(durableImport.inboxAddItem).toHaveBeenCalledTimes(2));

    const previewKeys = durableImport.inboxAddItem.mock.calls.map(([, options]) => options.idempotencyKey);
    expect(previewKeys[0]).toMatch(/^import_[A-Za-z0-9_-]{16,}$/);
    expect(previewKeys[1]).toMatch(/^import_[A-Za-z0-9_-]{16,}$/);
    expect(previewKeys[1]).not.toBe(previewKeys[0]);
  });
  it('gates live location behind persisted explicit consent without storing coordinates', () => {
    expect(locationSource).toContain("if (consent !== true) return undefined");
    expect(locationSource).toContain("locationConsentKey = 'rumbo.locationConsent'");
    expect(locationSource).toContain("legacyLocationKeys = ['rumbo.lastPosition', 'rumbo.manualPosition']");
    expect(locationSource).toContain('legacyLocationKeys.forEach(removeStorageValue)');
    expect(mainSource).toContain('if (locationConsent !== true)');
    expect(privacySource).toContain('No guardamos tus coordenadas');
    expect(privacySource).toContain('Vercel Analytics y Speed Insights');
  });

  it('shows a direct sync recovery action with accurate reconnect wording', () => {
    expect(mainSource).toContain("['offline', 'error'].includes(syncState.status)");
    expect(mainSource).toContain('>Reconectar</Button>');
    expect(mainSource).toContain('No se ha podido sincronizar.');
  });

  it('keeps one active-filter control with an obvious count', () => {
    expect(mainSource).toContain('badgeContent={filtersActive || null}');
    expect(mainSource).toContain('`Filtrar mapa, ${filtersActive} activos`');
    expect(mainSource).not.toContain('{filtersActive > 0 && (');
  });

  it('recovers snapshot errors and turns mutation failures into user-visible toasts', () => {
    expect(firestoreSource).toContain('const [inFlightWrites, setInFlightWrites] = useState(0)');
    expect(firestoreSource).toContain("setSyncError('');");
    expect(mainSource).toContain("No se ha podido eliminar el lugar.");
    expect(mainSource).toContain("No se ha podido recuperar el lugar.");
    expect(mainSource).toContain("No se ha podido descartar la recomendación.");
  });

  it('keeps undo retry state until a queued restoration settles durably', () => {
    const undoDeletePlace = mainSource.match(/async function undoDeletePlace\(\) \{([\s\S]*?)\n\s{2}\}/)?.[1];
    expect(undoDeletePlace).toContain('if (restored.queued)');
    expect(undoDeletePlace).toContain('restored.completion?.then(({ error }) =>');
    expect(undoDeletePlace).toContain("showToast('Recuperación en cola hasta recuperar la conexión.', 'info')");
    expect(undoDeletePlace).toContain("showToast(error.message || 'No se ha podido recuperar el lugar.', 'error', { undoDelete: true })");
    expect(undoDeletePlace.indexOf('setDeletedPlace(null)')).toBeGreaterThan(undoDeletePlace.indexOf('if (restored.queued)'));
  });

  it('does not update local authentication state when durable storage fails', () => {
    expect(authSource).toContain("if (!writeStorageJson(localUserKey, localUser)) throw new Error");
    expect(authSource).toContain("if (user?.isLocal && !removeStorageValue(localUserKey)) throw new Error");
  });

  it('confirms durable consent independently from live-position acquisition', () => {
    const activateLocation = mainSource.match(/async function activateLocation\(\) \{([\s\S]*?)\n\s{2}\}/)?.[1];
    expect(activateLocation).toContain('const locationResult = await enableLocation();');
    expect(activateLocation).toContain('if (!locationResult.enabled) return;');
    expect(activateLocation.indexOf("recordBreadcrumb('location.consent.enabled')")).toBeGreaterThan(activateLocation.indexOf('if (!locationResult.enabled) return;'));
    expect(activateLocation).toContain('if (locationResult.position)');
  });

  it('opens location onboarding automatically for a first-time user', () => {
    expect(mainSource).toContain('if (locationConsent === null) setLocationConsentOpen(true);');
  });

  it('leaves the map unchanged when live and stored positions are unavailable', () => {
    const centerOnUser = mainSource.match(/async function centerOnUser\(\) \{([\s\S]*?)\n\s{2}\}/)?.[1];
    expect(centerOnUser).toContain('const nextPosition = livePosition || position;');
    expect(centerOnUser).toMatch(/if \(!hasValidCoordinates\(nextPosition\)\) \{[\s\S]*?return;\n\s{4}\}\n\s{4}setMapCenter\(\{ lat: nextPosition\.lat, lng: nextPosition\.lng \}\);/);
  });

  it('rejects a place without coordinates when the current position is unavailable', () => {
    const buildPlacePayload = mainSource.match(/async function buildPlacePayload\(place, options = \{\}\) \{([\s\S]*?)\n\s{2}\}/)?.[1];
    expect(buildPlacePayload).toContain('allowCurrentFallback && hasValidCoordinates(position)');
    expect(buildPlacePayload).toContain("throw new Error('No he podido ubicar este lugar.");
  });
});
