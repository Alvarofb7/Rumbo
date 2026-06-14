function cleanText(value = '') {
  return String(value)
    .replace(/\*\*/g, '')
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

function normalizeLoose(value = '') {
  return normalizeCityName(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getSearchTokens(value = '') {
  const stopWords = new Set([
    'bar',
    'bares',
    'cafe',
    'cafeteria',
    'comer',
    'direccion',
    'espana',
    'restaurant',
    'restaurante',
    'restaurantes',
    'seville',
    'sevilla',
    'spain',
    'tapas',
    'y',
  ]);

  return normalizeLoose(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function inferCountryCode(value = '') {
  const normalized = normalizeForMatch(value);
  if (/(sevilla|seville|espana|spain|andalucia)/.test(normalized)) return 'es';
  return '';
}

function mentionsSevilla(value = '') {
  return /(sevilla|seville)/.test(normalizeForMatch(value));
}

function resultMatchesRequestedCity(query, result) {
  if (!mentionsSevilla(query)) return true;

  const haystack = normalizeLoose([result.name, result.address, result.zone].filter(Boolean).join(' '));
  return /\b(sevilla|seville)\b/.test(haystack);
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

const knownPlaceHints = [
  {
    aliases: ['seis tapas', 'seis tapas bar', 'bar seis'],
    name: 'SEIS Tapas Bar',
    address: 'Plaza Nueva, 7, 41001 Sevilla',
    zone: 'El Arenal',
    lat: 37.388222,
    lng: -5.9963925,
    type: 'restaurant',
    rating: 0,
  },
  {
    aliases: ['contenedor', 'con tenedor'],
    name: 'ConTenedor',
    address: 'Calle San Luis, 50, 41003 Sevilla',
    zone: 'San Julián',
    lat: 37.39842,
    lng: -5.9879244,
    type: 'restaurant',
    rating: 0,
  },
  {
    aliases: ['ojala tapas y vinos', 'ojala tapas', 'ojalá tapas y vinos', 'ojalá tapas'],
    name: 'Ojalá Tapas y Vinos',
    address: 'Calle Relator, 38, 41002 Sevilla',
    zone: 'Feria',
    lat: 37.4002734,
    lng: -5.9907373,
    type: 'restaurant',
    rating: 0,
  },
  {
    aliases: ['la comilona', 'comilona'],
    name: 'La Comilona',
    address: 'Calle Luis Arenas Ladislao, 41005 Sevilla',
    zone: 'La Buhaira',
    lat: 37.3852935,
    lng: -5.9718449,
    type: 'restaurant',
    rating: 0,
  },
  {
    aliases: ['mareaviva', 'marea viva'],
    name: 'MareaViva',
    address: 'Calle Luis Arenas Ladislao, 151, 41005 Sevilla',
    zone: 'La Buhaira',
    lat: 37.385741,
    lng: -5.97161,
    type: 'restaurant',
    rating: 0,
  },
];

function queryLooksLikeSevillaPlace(query = '') {
  const normalized = normalizeForMatch(query);
  return /(sevilla|seville|andalucia|espana|spain)/.test(normalized) || getSearchTokens(query).length >= 2;
}

function searchKnownPlaceHints(query) {
  if (!queryLooksLikeSevillaPlace(query)) return [];

  const normalizedQuery = normalizeForMatch(query);
  return knownPlaceHints
    .filter((place) => place.aliases.some((alias) => normalizeForMatch(alias).length >= 4 && normalizedQuery.includes(normalizeForMatch(alias))))
    .map((place) => ({
      id: `known-${normalizeForMatch(place.name)}`,
      name: place.name,
      address: place.address,
      zone: place.zone,
      lat: place.lat,
      lng: place.lng,
      type: place.type,
      category: 'curated',
      rating: place.rating,
      source: 'rumbo-curated',
    }));
}

function parseCoordinate(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function searchGooglePlaces(query, options = {}) {
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
        locationBias:
          Number.isFinite(options.lat) && Number.isFinite(options.lng)
            ? {
                circle: {
                  center: { latitude: options.lat, longitude: options.lng },
                  radius: 50000,
                },
              }
            : undefined,
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

function buildQueryVariants(query) {
  const normalized = normalizeCityName(query);
  const variants = [
    normalized,
    normalized.replace(/\bSeville\b/gi, 'Sevilla'),
    normalized.replace(/\bSevilla\b/gi, '').trim(),
    `${normalized} restaurante`,
    `${normalized} bar restaurante`,
  ];

  if (!/(sevilla|seville|spain|españa|andalucía|andalucia)/i.test(normalized) && normalized.split(/\s+/).length > 1) {
    variants.push(`${normalized}, Sevilla, España`);
  }

  return [...new Set(variants.map((variant) => cleanText(variant)).filter((variant) => variant.length >= 2))].slice(0, 5);
}

async function searchOpenStreetMap(query, options = {}) {
  const variants = buildQueryVariants(query).slice(0, options.maxVariants || 5);
  const allResults = [];
  const originalCountryCode = inferCountryCode(query);

  for (const variant of variants) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '8');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'es');
    url.searchParams.set('q', variant);
    const countryCode = originalCountryCode || inferCountryCode(variant);
    if (countryCode) url.searchParams.set('countrycodes', countryCode);

    let results = [];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 3500);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'Rumbo personal app',
        },
      });

      if (!response.ok) continue;
      results = await response.json();
    } catch {
      continue;
    } finally {
      clearTimeout(timeoutId);
    }

    allResults.push(
      ...results.map((result) => {
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
      }),
    );

    if (hasStrongMatch(query, allResults)) break;
  }

  return dedupeResults(allResults).slice(0, 8);
}

function hasStrongMatch(query, results = []) {
  const tokens = getSearchTokens(query);
  if (!tokens.length) return results.length > 0;

  return results.some((result) => {
    if (!resultMatchesRequestedCity(query, result)) return false;
    const haystack = normalizeLoose([result.name, result.address].filter(Boolean).join(' '));
    return tokens.every((token) => haystack.includes(token));
  });
}

function scoreResult(query, result) {
  const tokens = getSearchTokens(query);
  const haystack = normalizeLoose([result.name, result.address].filter(Boolean).join(' '));
  const exactName = normalizeForMatch(result.name) && normalizeForMatch(query).includes(normalizeForMatch(result.name));
  const matchedTokens = tokens.filter((token) => haystack.includes(token)).length;
  const sourceScore = {
    'google-places': 60,
    'rumbo-curated': 55,
    'public-web': 45,
    openstreetmap: 25,
  }[result.source] || 0;
  const categoryScore = ['restaurant', 'bar', 'cafe', 'pub', 'amenity'].includes(result.type || result.category) ? 8 : 0;

  return sourceScore + matchedTokens * 15 + (exactName ? 20 : 0) + categoryScore + Number(result.rating || 0);
}

function dedupeResults(results = []) {
  const seen = new Set();

  return results.filter((result) => {
    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return false;
    const key = [
      normalizeForMatch(result.name || result.address),
      Number(result.lat).toFixed(5),
      Number(result.lng).toFixed(5),
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortResults(query, results = []) {
  const scopedResults = mentionsSevilla(query) ? results.filter((result) => resultMatchesRequestedCity(query, result)) : results;

  return dedupeResults(scopedResults)
    .map((result) => ({ ...result, score: scoreResult(query, result) }))
    .sort((a, b) => b.score - a.score)
    .map((result) => {
      const nextResult = { ...result };
      delete nextResult.score;
      return nextResult;
    });
}

function stripMarkup(value = '') {
  return cleanText(
    value
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)]\([^)]*\)/g, ' $1 ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function cleanExtractedAddress(value = '') {
  return normalizeCityName(
    stripMarkup(value)
      .replace(/^(ubicado en|ubicada en|lo encontrarás en|direccion|dirección|address|📌)\s*/i, '')
      .replace(/\s+en los bajos.*$/i, '')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ',')
      .trim(),
  );
}

function extractAddressCandidates(text = '') {
  const cleaned = stripMarkup(text);
  const patterns = [
    /\bUbicad[oa]\s+en\s+([^.!?\n]{3,130}?(?:Sevilla|Hotel Inglaterra|España|Spain|$))/gi,
    /📌\s*([^.!?\n]{3,130}?(?:Sevilla|España|Spain))/gi,
    /\b(?:c\/|c\.|calle|plaza|av\.|avenida|paseo|ronda)\s+[^.!?\n]{2,120}?(?:,\s*\d+[A-Za-z]?|\d+[A-Za-z]?)[^.!?\n]{0,80}?(?:Sevilla|España|Spain)?/gi,
  ];

  const candidates = [];
  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern)) {
      const candidate = cleanExtractedAddress(match[1] || match[0]);
      if (candidate && candidate.length >= 8) candidates.push(candidate);
    }
  }

  return [...new Set(candidates)]
    .map((candidate) => (/(sevilla|seville|españa|spain)/i.test(candidate) ? candidate : `${candidate}, Sevilla`))
    .slice(0, 5);
}

async function fetchReadableSearch(query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3800);

  try {
    const targetUrl = `http://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(`https://r.jina.ai/http://${targetUrl}`, {
      signal: controller.signal,
      headers: {
        accept: 'text/plain',
        'user-agent': 'Rumbo personal app',
      },
    });

    if (!response.ok) return '';
    return response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

async function geocodeAddress(address, baseName = '') {
  const addressResults = await searchOpenStreetMap(address, { maxVariants: 2, timeoutMs: 2500 });
  if (addressResults.length) return addressResults[0];

  const results = await searchOpenStreetMap([address, baseName].filter(Boolean).join(' '), { maxVariants: 2, timeoutMs: 2500 });
  return results.find((result) => Number.isFinite(result.lat) && Number.isFinite(result.lng)) || null;
}

async function searchPublicWeb(query) {
  if (!queryLooksLikeSevillaPlace(query)) return [];

  const webText = await fetchReadableSearch(`${query} dirección`);
  if (!webText) return [];

  const addresses = extractAddressCandidates(webText).slice(0, 3);
  const results = [];

  for (const address of addresses) {
    try {
      const geocoded = await geocodeAddress(address, query);
      if (geocoded) {
        results.push({
          ...geocoded,
          id: `web-${normalizeForMatch(query)}-${normalizeForMatch(address)}`,
          name: cleanText(query.replace(/\b(dirección|direccion|restaurante|bar)\b/gi, '')) || geocoded.name,
          address: normalizeCityName(geocoded.address || address),
          zone: geocoded.zone,
          source: 'public-web',
        });
      }
    } catch {
      // Try the next extracted address.
    }
  }

  return results;
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    response.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const body = request.method === 'POST' && typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {};
  const query = cleanText(request.query?.q || body.query || '');
  const lat = parseCoordinate(request.query?.lat || body.lat, Number.NaN);
  const lng = parseCoordinate(request.query?.lng || body.lng, Number.NaN);
  if (query.length < 2) {
    response.status(200).json([]);
    return;
  }

  try {
    const knownResults = searchKnownPlaceHints(query);
    if (hasStrongMatch(query, knownResults)) {
      response.status(200).json(sortResults(query, knownResults).slice(0, 8));
      return;
    }

    const googleResults = await searchGooglePlaces(query, { lat, lng });

    if (googleResults?.length) {
      response.status(200).json(sortResults(query, [...knownResults, ...googleResults]).slice(0, 8));
      return;
    }

    const osmResults = await searchOpenStreetMap(query);
    const needsWebFallback = !hasStrongMatch(query, [...knownResults, ...osmResults]);
    const webResults = needsWebFallback ? await searchPublicWeb(query) : [];
    response.status(200).json(sortResults(query, [...knownResults, ...webResults, ...osmResults]).slice(0, 8));
  } catch (error) {
    response.status(400).json({ error: error.message || 'No se pudo buscar la ubicación.' });
  }
}
