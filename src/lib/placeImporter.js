import { parsePlaceLink } from './linkParser';
import { sanitizePlaceRecord } from './placeData';
import { normalizeSupportedPlaceUrl } from './placeUrl';

function importWithLocalParser(url) {
  return sanitizePlaceRecord(parsePlaceLink(url));
}

function isRecoverableImportFailure(error) {
  return error instanceof TypeError || error?.code === 'auth/network-request-failed' ||
    /failed to fetch|network|conexi[oó]n/i.test(String(error?.message || ''));
}

export async function importPlaceFromUrl(url, { user } = {}) {
  const normalizedUrl = normalizeSupportedPlaceUrl(url);
  if (!user || user.isLocal || typeof user.getIdToken !== 'function') {
    return importWithLocalParser(normalizedUrl);
  }
  try {
    const token = await user.getIdToken();
    if (!token) throw new Error('No se pudo obtener una sesión válida para importar el enlace.');
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
    if (response.ok) return importWithLocalParser(normalizedUrl);
    const error = await response.json().catch(() => null);
    if (response.status >= 500) return importWithLocalParser(normalizedUrl);
    throw new Error(error?.error || 'No se pudo importar el enlace.');
  } catch (error) {
    if (!isRecoverableImportFailure(error)) throw error;
  }

  return importWithLocalParser(normalizedUrl);
}
