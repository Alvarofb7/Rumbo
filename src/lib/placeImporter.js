import { parsePlaceLink } from './linkParser';
import { sanitizePlaceRecord } from './placeData';
import { normalizeSupportedPlaceUrl } from './placeUrl';

export async function importPlaceFromUrl(url, { user } = {}) {
  const normalizedUrl = normalizeSupportedPlaceUrl(url);
  if (!user || user.isLocal || typeof user.getIdToken !== 'function') {
    return sanitizePlaceRecord(parsePlaceLink(normalizedUrl));
  }
  const token = await user.getIdToken();
  if (!token) throw new Error('No se pudo obtener una sesión válida para importar el enlace.');
  try {
    const response = await fetch('/api/import-place', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: normalizedUrl }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) return sanitizePlaceRecord(await response.json());
    if (response.ok) return sanitizePlaceRecord(parsePlaceLink(normalizedUrl));
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'No se pudo importar el enlace.');
  } catch (error) {
    if (!String(error.message || '').includes('Failed to fetch')) throw error;
  }

  return sanitizePlaceRecord(parsePlaceLink(normalizedUrl));
}
