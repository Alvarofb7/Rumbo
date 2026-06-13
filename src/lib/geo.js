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

export function normalizeCoordinate(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizePosition(place, fallback = defaultCenter) {
  return {
    lat: normalizeCoordinate(place?.lat, fallback.lat),
    lng: normalizeCoordinate(place?.lng, fallback.lng),
  };
}

export async function searchLocation(query) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('q', trimmed);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('No se pudo buscar la ubicación.');
  }

  const results = await response.json();
  return results.map((result) => ({
    id: result.place_id,
    name: result.name || result.display_name.split(',')[0],
    address: result.display_name,
    lat: Number(result.lat),
    lng: Number(result.lon),
    type: result.type,
  }));
}
