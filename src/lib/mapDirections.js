function encode(value) {
  return encodeURIComponent(String(value || '').trim());
}

function hasValidCoordinate(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

export function getDeviceMapProvider(navigatorLike = globalThis.navigator) {
  const userAgent = navigatorLike?.userAgent || '';
  const platform = navigatorLike?.platform || '';
  const maxTouchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  const isAppleDevice =
    /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent) ||
    /Mac/i.test(platform) ||
    (/Macintosh/i.test(platform) && maxTouchPoints > 1);

  return isAppleDevice ? 'apple' : 'google';
}

export function resolveMapProvider(navigatorLike = globalThis.navigator) {
  return getDeviceMapProvider(navigatorLike);
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

export function buildDirectionsUrl(place, navigatorLike = globalThis.navigator) {
  const provider = resolveMapProvider(navigatorLike);
  const url = provider === 'google' ? buildGoogleDirectionsUrl(place) : buildAppleDirectionsUrl(place);

  return { provider, url };
}
