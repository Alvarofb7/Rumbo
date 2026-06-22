import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

describe('iPhone-first safeguards', () => {
  it('keeps the installed PWA portrait-safe without forced reloads', () => {
    expect(read('index.html')).toContain('viewport-fit=cover');
    expect(read('index.html')).toContain('maximum-scale=1');
    expect(read('index.html')).toContain('user-scalable=no');
    expect(read('public/manifest.webmanifest')).toContain('"orientation": "portrait"');
    expect(read('src/main.jsx')).not.toContain('window.location.reload()');
  });

  it('preserves drafts and uses a compact import sheet on small displays', () => {
    const placeDialog = read('src/components/dialogs/PlaceDialog.jsx');
    const linkDialog = read('src/components/dialogs/LinkImportDialog.jsx');

    expect(placeDialog).toContain('draftMaxAge');
    expect(placeDialog).toContain('draftStorageKey');
    expect(linkDialog).toContain("alignSelf: 'flex-end'");
    expect(linkDialog).toContain("borderRadius: '24px 24px 0 0'");
    expect(linkDialog).not.toContain('fullScreen=');
  });

  it('keeps passive GPS updates battery-friendly and manual references stable', () => {
    const locationHook = read('src/hooks/useUserLocation.js');
    expect(locationHook).toContain('enableHighAccuracy: false');
    expect(locationHook).toContain('Mantengo la referencia manual');
    expect(locationHook).toContain('livePositionVersionRef');
  });

  it('queues Firestore changes offline and exposes mobile-safe actions', () => {
    const firebase = read('src/lib/firebase.js');
    expect(firebase).toContain('persistentLocalCache');
    expect(firebase).not.toContain('firebase/storage');
    expect(read('src/theme.js')).toContain('MuiIconButton');
    expect(read('src/components/cards/GooglePlaceCard.jsx')).toContain('Guardar rápido');
    expect(read('src/components/navigation/AppMenuDrawer.jsx')).toContain('Importar enlace');
    expect(read('src/components/MainApp.jsx')).toContain('Deshacer');
  });

  it('collects real iPhone performance and shareable diagnostics', () => {
    const app = read('src/App.jsx');
    const menu = read('src/components/navigation/AppMenuDrawer.jsx');
    expect(app).toContain('<Analytics />');
    expect(app).toContain('<SpeedInsights />');
    expect(read('src/main.jsx')).toContain('installGlobalDiagnostics');
    expect(menu).toContain('Compartir diagnóstico');
  });

  it('keeps place actions compact and touch-friendly', () => {
    const placesPanel = read('src/components/panels/PlacesPanel.jsx');
    expect(placesPanel).toContain('MoreVertIcon');
    expect(placesPanel).toContain('Cómo llegar');
    expect(placesPanel).toContain('minHeight: 48');
    expect(placesPanel).not.toContain('justifyContent="flex-end"');
  });
});
