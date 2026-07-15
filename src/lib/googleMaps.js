let googleMapsPromise;
let activeScript;
const callbackName = '__rumboGoogleMapsReady';
const defaultTimeoutMs = 12000;

function getApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';
}

export function hasGoogleMapsConfig() {
  return Boolean(getApiKey());
}

export function loadGoogleMaps({ timeoutMs = defaultTimeoutMs, apiKey = getApiKey() } = {}) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  if (!apiKey) {
    return Promise.reject(new Error('Falta configurar VITE_GOOGLE_MAPS_API_KEY.'));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previousCallback = window[callbackName];
    const ownsGoogleGlobal = !window.google;
    let timeoutId;
    let settled = false;
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      language: 'es',
      region: 'ES',
      callback: callbackName,
    });

    const clearCallback = () => {
      if (previousCallback) window[callbackName] = previousCallback;
      else delete window[callbackName];
    };
    const resetFailedLoad = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      clearCallback();
      script.onerror = null;
      if (activeScript === script) {
        activeScript = undefined;
        script.remove();
      }
      if (ownsGoogleGlobal && !window.google?.maps?.importLibrary) delete window.google;
      if (googleMapsPromise) googleMapsPromise = undefined;
      reject(error);
    };

    window[callbackName] = () => {
      if (settled) return;
      const maps = window.google?.maps;
      if (!maps?.importLibrary) {
        resetFailedLoad(new Error('Google Maps terminó de cargar sin la API esperada.'));
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      clearCallback();
      script.onerror = null;
      activeScript = script;
      resolve(maps);
    };
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => resetFailedLoad(new Error('No se pudo cargar Google Maps. Revisa la clave y las APIs habilitadas.'));
    timeoutId = window.setTimeout(
      () => resetFailedLoad(new Error('Google Maps tardó demasiado en responder. Comprueba tu conexión e inténtalo de nuevo.')),
      timeoutMs,
    );
    activeScript = script;
    document.head.append(script);
  });

  return googleMapsPromise;
}

export function resetGoogleMapsLoaderForTests() {
  googleMapsPromise = undefined;
  activeScript = undefined;
}

export async function importGoogleLibrary(name) {
  const maps = await loadGoogleMaps();
  return maps.importLibrary(name);
}
