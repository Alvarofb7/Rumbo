function cleanText(value = '') {
  return String(value)
    .replace(/\+/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCityName(value = '') {
  return cleanText(value)
    .replace(/\bSeville\b/gi, 'Sevilla')
    .replace(/\bSpain\b/gi, 'España')
    .trim();
}

function normalizeForMatch(value = '') {
  return normalizeCityName(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function inferCountryCode(value = '') {
  const normalized = normalizeForMatch(value);
  if (/(sevilla|seville|espana|spain|andalucia)/.test(normalized)) return 'es';
  return '';
}

function getAddressZone(address = {}) {
  return (
    address.neighbourhood ||
    address.suburb ||
    address.quarter ||
    address.city_district ||
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state ||
    ''
  );
}

function getGooglePlacesApiKey() {
  const env = globalThis.process?.env || {};
  return env.GOOGLE_PLACES_API_KEY || env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || '';
}

async function searchGooglePlaces(query) {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.addressComponents,places.primaryType,places.types',
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'es',
        regionCode: inferCountryCode(query)?.toUpperCase() || undefined,
        maxResultCount: 8,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();

    return (data.places || []).map((place) => {
      const location = place.location || {};
      const lat = Number(location.latitude);
      const lng = Number(location.longitude);
      const zone = place.addressComponents?.find((component) => component.types?.includes('locality'))?.longText || '';

      return {
        id: place.id,
        name: place.displayName?.text || place.formattedAddress?.split(',')[0] || 'Lugar',
        address: normalizeCityName(place.formattedAddress || ''),
        zone: normalizeCityName(zone),
        lat,
        lng,
        type: place.primaryType || place.types?.[0] || '',
        category: 'google_places',
        rating: Number(place.rating || 0),
        source: 'google-places',
      };
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchOpenStreetMap(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');
  url.searchParams.set('q', query);
  const countryCode = inferCountryCode(query);
  if (countryCode) url.searchParams.set('countrycodes', countryCode);

  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'user-agent': 'Rumbo personal app',
    },
  });

  if (!response.ok) throw new Error('No se pudo buscar la ubicación.');
  const results = await response.json();

  return results.map((result) => {
    const address = result.address || {};

    return {
      id: result.place_id,
      name: result.name || result.display_name.split(',')[0],
      address: result.display_name,
      zone: getAddressZone(address),
      lat: Number(result.lat),
      lng: Number(result.lon),
      type: result.type,
      category: result.category || result.class,
      source: 'openstreetmap',
    };
  });
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    response.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const body = request.method === 'POST' && typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {};
  const query = cleanText(request.query?.q || body.query || '');
  if (query.length < 2) {
    response.status(200).json([]);
    return;
  }

  try {
    const googleResults = await searchGooglePlaces(query);
    response.status(200).json(googleResults?.length ? googleResults : await searchOpenStreetMap(query));
  } catch (error) {
    response.status(400).json({ error: error.message || 'No se pudo buscar la ubicación.' });
  }
}
