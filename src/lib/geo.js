import { defaultCenter } from '../data/demoData';

export function toRad(value) {
  return (value * Math.PI) / 180;
}

export function distanceInMeters(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'Sin distancia';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace('.', ',')} km`;
}

export function findNearestPlace(position, places = [], maxDistance = Number.POSITIVE_INFINITY) {
  const origin = {
    lat: position?.lat === '' ? Number.NaN : Number(position?.lat),
    lng: position?.lng === '' ? Number.NaN : Number(position?.lng),
  };
  let nearestPlace = null;
  let nearestDistance = maxDistance;

  places.forEach((place) => {
    const candidate = {
      lat: place?.lat === '' ? Number.NaN : Number(place?.lat),
      lng: place?.lng === '' ? Number.NaN : Number(place?.lng),
    };
    const distance = distanceInMeters(origin, candidate);
    if (distance <= nearestDistance) {
      nearestPlace = place;
      nearestDistance = distance;
    }
  });

  return nearestPlace;
}

export function normalizeCoordinate(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizePosition(place, fallback = defaultCenter) {
  return {
    lat: normalizeCoordinate(place?.lat, fallback.lat),
    lng: normalizeCoordinate(place?.lng, fallback.lng),
  };
}
