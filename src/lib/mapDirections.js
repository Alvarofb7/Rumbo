export const mapProviderOptions = [
  { value: 'auto', label: 'Automático' },
  { value: 'apple', label: 'Apple Maps' },
  { value: 'google', label: 'Google Maps' },
];

const validMapProviders = new Set(mapProviderOptions.map((option) => option.value));

function encode(value) {
  return encodeURIComponent(String(value || '').trim());
}

function hasValidCoordinate(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

export function normalizeMapProviderPreference(value) {
  return validMapProviders.has(value) ? value : 'auto';
}

export function getDeviceMapProvider(navigatorLike = globalThis.navigator) {
  const userAgent = navigatorLike?.userAgent || '';
  const platform = navigatorLike?.platform || '';
  const maxTouchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(platform) && maxTouchPoints > 1);

  if (isAndroid) return 'google';
  if (isIOS) return 'apple';
  return 'apple';
}

export function resolveMapProvider(preference = 'auto', navigatorLike = globalThis.navigator) {
  const normalized = normalizeMapProviderPreference(preference);
  return normalized === 'auto' ? getDeviceMapProvider(navigatorLike) : normalized;
}

export function buildAppleDirectionsUrl(place) {
  if (!hasValidCoordinate(place?.lat) || !hasValidCoordinate(place?.lng)) return '';

  const lat = Number(place.lat);
  const lng = Number(place.lng);
  const label = encode(place.name || place.address || 'Destino');
  return `https://maps.apple.com/?daddr=${lat},${lng}&q=${label}`;
}

export function buildGoogleDirectionsUrl(place) {
  if (!hasValidCoordinate(place?.lat) || !hasValidCoordinate(place?.lng)) return '';

  const params = new URLSearchParams({ api: '1' });
  const label = place?.name || place?.address || 'Destino';

  if (place?.providerPlaceId) {
    params.set('destination', label);
    params.set('destination_place_id', place.providerPlaceId);
  } else {
    params.set('destination', `${Number(place.lat)},${Number(place.lng)}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildDirectionsUrl(place, preference = 'auto', navigatorLike = globalThis.navigator) {
  const provider = resolveMapProvider(preference, navigatorLike);
  const url = provider === 'google' ? buildGoogleDirectionsUrl(place) : buildAppleDirectionsUrl(place);

  return { provider, url };
}
