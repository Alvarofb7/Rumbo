import { distanceInMeters } from './geo';

const nearbyDuplicateRadiusMeters = 80;

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeUrl(value = '') {
  const input = String(value || '').trim();
  if (!input) return '';

  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    const ignoredParams = new Set(['fbclid', 'gclid', 'igsh', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term']);
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !ignoredParams.has(key.toLowerCase()))
      .sort(([left], [right]) => left.localeCompare(right));
    const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.hostname.toLowerCase()}${path}${query}`;
  } catch {
    return normalizeText(input);
  }
}

function recordName(record = {}) {
  return normalizeText(record.name || record.title);
}

function recordAddress(record = {}) {
  return normalizeText(record.address);
}

function recordLinks(record = {}) {
  return [record.sourceUrl, record.resolvedUrl].map(normalizeUrl).filter(Boolean);
}

function providerPlaceId(record = {}) {
  return String(record.providerPlaceId || '').trim();
}

function hasCoordinates(record = {}) {
  return Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lng));
}

function getDistance(left, right) {
  if (!hasCoordinates(left) || !hasCoordinates(right)) return Number.POSITIVE_INFINITY;
  return distanceInMeters(
    { lat: Number(left.lat), lng: Number(left.lng) },
    { lat: Number(right.lat), lng: Number(right.lng) },
  );
}

function namesLookSimilar(leftName, rightName) {
  if (!leftName || !rightName) return false;
  if (leftName === rightName) return true;
  if (leftName.length < 5 || rightName.length < 5) return false;
  return leftName.includes(rightName) || rightName.includes(leftName);
}

function addressesMatch(leftAddress, rightAddress) {
  if (!leftAddress || !rightAddress) return false;
  return leftAddress === rightAddress || leftAddress.includes(rightAddress) || rightAddress.includes(leftAddress);
}

export function getDuplicateMatch(candidate = {}, saved = {}) {
  const candidateProviderId = providerPlaceId(candidate);
  const savedProviderId = providerPlaceId(saved);
  if (candidateProviderId && savedProviderId && candidateProviderId === savedProviderId) return 'providerPlaceId';

  const candidateLinks = recordLinks(candidate);
  const savedLinks = new Set(recordLinks(saved));
  if (candidateLinks.some((link) => savedLinks.has(link))) return 'sourceUrl';

  const candidateName = recordName(candidate);
  const savedName = recordName(saved);
  const namesMatch = namesLookSimilar(candidateName, savedName);
  const distance = getDistance(candidate, saved);

  if (namesMatch && distance <= nearbyDuplicateRadiusMeters) return 'nearbyName';
  if (namesMatch && addressesMatch(recordAddress(candidate), recordAddress(saved))) return 'addressName';

  return '';
}

export function findDuplicatePlace(candidate = {}, places = [], options = {}) {
  const excludeId = String(options.excludeId || '');

  return places.find((place) => {
    if (!place) return false;
    if (excludeId && String(place.id || '') === excludeId) return false;
    return Boolean(getDuplicateMatch(candidate, place));
  }) || null;
}

export function getImportDuplicate(candidate = {}, savedPlaces = [], inbox = []) {
  const previewCandidate = candidate.place
    ? {
        ...candidate.place,
        providerPlaceId: candidate.source?.providerId || candidate.place.providerPlaceId,
        sourceUrl: candidate.source?.canonicalUrl || candidate.place.sourceUrl,
        resolvedUrl: candidate.source?.resolvedUrl || candidate.place.resolvedUrl,
      }
    : candidate;
  const collections = [['saved', savedPlaces], ['inbox', inbox]];
  for (const [matchedCollection, places] of collections) {
    const match = findDuplicatePlace(previewCandidate, places);
    if (!match) continue;
    const reason = getDuplicateMatch(previewCandidate, match);
    return {
      status: ['providerPlaceId', 'sourceUrl'].includes(reason) ? 'probable' : 'possible',
      matchedCollection,
      matchedId: match.id || null,
      reasons: [reason],
    };
  }
  return { status: 'none', matchedCollection: null, matchedId: null, reasons: [] };
}
