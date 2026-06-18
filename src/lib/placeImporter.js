import { parsePlaceLink } from './linkParser';
import { sanitizePlaceRecord } from './placeData';

export async function importPlaceFromUrl(url) {
  try {
    const response = await fetch('/api/import-place', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) return sanitizePlaceRecord(await response.json());
    if (response.ok) return sanitizePlaceRecord(parsePlaceLink(url));

    if (response.status !== 404) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'No se pudo importar el enlace.');
    }
  } catch (error) {
    if (!String(error.message || '').includes('Failed to fetch')) throw error;
  }

  return sanitizePlaceRecord(parsePlaceLink(url));
}
