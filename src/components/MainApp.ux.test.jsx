import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('./MainApp.jsx', import.meta.url), 'utf8');
const locationSource = readFileSync(new URL('../hooks/useUserLocation.js', import.meta.url), 'utf8');
const privacySource = readFileSync(new URL('./privacy/LocationPrivacy.jsx', import.meta.url), 'utf8');
const firestoreSource = readFileSync(new URL('../hooks/useFirestoreCollection.js', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../context/AuthContext.jsx', import.meta.url), 'utf8');

describe('remaining UX and privacy integrations', () => {
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

  it('only confirms location consent after enablement succeeds', () => {
    const activateLocation = mainSource.match(/async function activateLocation\(\) \{([\s\S]*?)\n\s{2}\}/)?.[1];
    expect(activateLocation).toContain('const livePosition = await enableLocation();');
    expect(activateLocation).toContain('if (!livePosition) return;');
    expect(activateLocation.indexOf("recordBreadcrumb('location.consent.enabled')")).toBeGreaterThan(activateLocation.indexOf('if (!livePosition) return;'));
    expect(activateLocation.indexOf('setLocationConsentOpen(false)')).toBeGreaterThan(activateLocation.indexOf('if (!livePosition) return;'));
  });
});
