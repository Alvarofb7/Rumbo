import { parsePlaceLink } from './linkParser';
import { sanitizePlaceRecord } from './placeData';
import { normalizeImportPreview } from './importPreview';
import { normalizeSupportedPlaceUrl } from './placeUrl';

const editableFields = new Set(['title', 'address', 'zone', 'category', 'tags', 'rating']);
const acknowledgementWarnings = new Set(['AMBIGUOUS_MATCH', 'APPROXIMATE_COORDINATES']);

export function updateImportPreview(preview, changes = {}) {
  const editableChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => editableFields.has(key)));
  return {
    ...preview,
    place: { ...preview.place, ...editableChanges },
    acknowledgedWarnings: Object.keys(editableChanges).length ? [] : (preview.acknowledgedWarnings || []),
  };
}

export function applyPreviewCoordinates(preview, selection = {}) {
  if (!Number.isFinite(Number(selection.lat)) || !Number.isFinite(Number(selection.lng))) return preview;
  return {
    ...preview,
    place: { ...preview.place, lat: Number(selection.lat), lng: Number(selection.lng) },
    quality: { ...preview.quality, coordinateQuality: 'exact', provenance: 'place_search', warnings: (preview.quality.warnings || []).filter((warning) => warning !== 'MISSING_COORDINATES' && warning !== 'APPROXIMATE_COORDINATES') },
    duplicate: { ...preview.duplicate, status: 'unchecked', matchedCollection: null, matchedId: null, reasons: [] },
    acknowledgedWarnings: [],
  };
}

export function canConfirmImportPreview(preview = {}) {
  if (!preview.place?.title?.trim()) return { allowed: false, reason: 'TITLE_REQUIRED' };
  if (preview.duplicate?.status === 'unchecked') return { allowed: false, reason: 'DUPLICATE_UNCHECKED' };
  if (preview.duplicate?.status === 'probable') return { allowed: false, reason: 'PROBABLE_DUPLICATE' };
  if (preview.quality?.coordinateQuality === 'missing') return { allowed: false, reason: 'MISSING_COORDINATES' };
  const missingAcknowledgment = (preview.quality?.warnings || []).find((warning) => acknowledgementWarnings.has(warning) && !(preview.acknowledgedWarnings || []).includes(warning));
  return { allowed: !missingAcknowledgment, reason: missingAcknowledgment || '' };
}

function importWithLocalParser(url) {
  const place = sanitizePlaceRecord(parsePlaceLink(url));
  return normalizeImportPreview({
    source: { provider: place.sourceType || 'manual', inputUrl: url, canonicalUrl: url, resolvedUrl: url, providerId: place.providerPlaceId || '' },
    place,
    provenance: 'local_parser',
    coordinateQuality: Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)) ? 'approximate' : 'missing',
  });
}

function asPreview(record, url) {
  if (record?.place && record?.quality) return { ...record, place: { ...record.place }, acknowledgedWarnings: [] };
  return importWithLocalParser(url);
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
    if (response.ok && contentType.includes('application/json')) return asPreview(sanitizePlaceRecord(await response.json()), normalizedUrl);
    if (response.ok) return importWithLocalParser(normalizedUrl);
    const error = await response.json().catch(() => null);
    if (response.status >= 500) return importWithLocalParser(normalizedUrl);
    throw new Error(error?.error || 'No se pudo importar el enlace.');
  } catch (error) {
    if (!isRecoverableImportFailure(error)) throw error;
  }

  return importWithLocalParser(normalizedUrl);
}
