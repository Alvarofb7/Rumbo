let googleMapsPromise;

function getApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';
}

export function hasGoogleMapsConfig() {
  return Boolean(getApiKey());
}

export function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  const apiKey = getApiKey();
  if (!apiKey) {
    return Promise.reject(new Error('Falta configurar VITE_GOOGLE_MAPS_API_KEY.'));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = '__rumboGoogleMapsReady';
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      language: 'es',
      region: 'ES',
      callback: callbackName,
    });

    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google.maps);
    };
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      delete window[callbackName];
      googleMapsPromise = undefined;
      reject(new Error('No se pudo cargar Google Maps. Revisa la clave y las APIs habilitadas.'));
    };
    document.head.append(script);
  });

  return googleMapsPromise;
}

export async function importGoogleLibrary(name) {
  const maps = await loadGoogleMaps();
  return maps.importLibrary(name);
}
