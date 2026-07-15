import { inferPlaceCategory, normalizePlaceTags } from '../src/lib/placeData.js';
import { ImportSecurityError, createBestEffortRateLimiter, fetchSafeHtml, verifyFirebaseIdToken } from './importSecurity.js';

const sourceMatchers = [
  { sourceType: 'instagram', patterns: ['instagram.com'] },
  { sourceType: 'tripadvisor', patterns: ['tripadvisor.'] },
  { sourceType: 'apple', patterns: ['maps.apple.com'] },
  { sourceType: 'google', patterns: ['google.com/maps', 'maps.google.', 'goo.gl/maps', 'maps.app.goo.gl'] },
];

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value = '') {
  let decoded = String(value);

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = String(value);
  }

  return decodeHtml(decoded)
    .replace(/\+/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanName(value = '') {
  return cleanText(value)
    .replace(/\s*\|\s*(restaurante|restaurant|bar|caf[eé]).*$/i, '')
    .replace(/\s+-\s+.*?(tripadvisor|google maps|maps).*$/i, '')
    .replace(/\bOpiniones\b.*$/i, '')
    .replace(/\bReviews\b.*$/i, '')
    .trim();
}

function normalizeCityName(value = '') {
  return cleanText(value)
    .replace(/\bSeville\b/gi, 'Sevilla')
    .replace(/\bSpain\b/gi, 'España')
    .replace(/\bUnited States\b/gi, 'Estados Unidos')
    .replace(/\bProvince of\b.*$/i, '')
    .trim();
}

function inferSource(url) {
  const lower = url.toLowerCase();
  return sourceMatchers.find((matcher) => matcher.patterns.some((pattern) => lower.includes(pattern)))?.sourceType || 'manual';
}

function extractCoordinatesFromText(text) {
  const exactMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (exactMatch) return { lat: Number(exactMatch[1]), lng: Number(exactMatch[2]) };

  const llMatch = text.match(/[?&](?:ll|sll|q)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (llMatch) return { lat: Number(llMatch[1]), lng: Number(llMatch[2]) };

  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) };

  return null;
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

function inferTags(name = '') {
  const lower = name.toLowerCase();
  const tags = [];

  if (lower.includes('terraza')) tags.push('Terraza');
  if (lower.includes('tapas')) tags.push('Tapas');
  if (lower.includes('brunch')) tags.push('Brunch');
  if (lower.includes('vino')) tags.push('Vino');

  return tags;
}

function parseGoogleUrl(url) {
  const parsedUrl = new URL(url);
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  const placeIndex = pathParts.findIndex((part) => part.toLowerCase() === 'place');
  const searchIndex = pathParts.findIndex((part) => part.toLowerCase() === 'search');
  const queryName = parsedUrl.searchParams.get('q') || parsedUrl.searchParams.get('query');
  const pathName = placeIndex >= 0 ? pathParts[placeIndex + 1] : searchIndex >= 0 ? pathParts[searchIndex + 1] : '';
  const name = cleanName(queryName || pathName || '');

  return {
    name,
    coordinates: extractCoordinatesFromText(url),
  };
}

function parseTripadvisorUrl(url) {
  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname.split('/').filter(Boolean).at(-1) || '';
  const withoutExtension = path.replace(/\.html?$/i, '');
  const afterReviews = withoutExtension.split(/-Reviews-/i)[1] || withoutExtension;
  const [rawName, rawCity = ''] = afterReviews.split('-');
  const city = normalizeCityName(rawCity);
  const locationId = withoutExtension.match(/(?:^|-)d(\d+)(?:-|$)/i)?.[1] || '';

  return {
    name: cleanName(rawName),
    zone: city,
    address: [cleanName(rawName), city].filter(Boolean).join(', '),
    coordinates: extractCoordinatesFromText(url),
    tripadvisorLocationId: locationId,
  };
}

function parseMetadata(html) {
  const title =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    '';
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    '';

  return {
    name: cleanName(title),
    address: cleanText(description),
  };
}

function getServerEnv(name) {
  return globalThis.process?.env?.[name] || '';
}

function getGooglePlacesApiKey() {
  return getServerEnv('GOOGLE_PLACES_API_KEY') || getServerEnv('GOOGLE_MAPS_API_KEY') || getServerEnv('VITE_GOOGLE_MAPS_API_KEY');
}

function getTripadvisorApiKey() {
  return getServerEnv('TRIPADVISOR_API_KEY') || getServerEnv('VITE_TRIPADVISOR_API_KEY');
}

function normalizeForMatch(value = '') {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function resultMatchesExpectedLocation(result, basePlace = {}, query = '') {
  const expectedZone = normalizeForMatch(basePlace.zone || basePlace.address || '');
  if (!expectedZone) return true;
  const resultContext = normalizeForMatch([result?.address, query].filter(Boolean).join(' '));
  return resultContext.includes(expectedZone) || expectedZone.includes(resultContext);
}

function isBroadPlaceResult(result) {
  return (
    ['boundary', 'place'].includes(result.category) ||
    ['city', 'town', 'village', 'municipality', 'administrative', 'county', 'state'].includes(result.type)
  );
}

function isAddressQuery(query) {
  const hasStreetPrefix = /(?:\bC\.|\bC\/|\bCalle\b|\bAv\.|\bAvenida\b|\bPaseo\b|\bPlaza\b|\bPza\.|\bRonda\b|\bCamino\b|\bCarretera\b)/i.test(
    query,
  );
  const hasStreetNumber = /\b[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.\s-]{2,80},\s*\d+[A-Za-z]?\b/i.test(query);
  return (hasStreetPrefix || hasStreetNumber) && /\d/.test(query);
}

function isSpecificEnough(result, basePlace, query) {
  if (!Number.isFinite(Number(result?.lat)) || !Number.isFinite(Number(result?.lng))) return false;
  if (!resultMatchesExpectedLocation(result, basePlace, query)) return false;
  if (isAddressQuery(query)) return true;
  if (isBroadPlaceResult(result)) return false;

  const resultName = normalizeForMatch(result.name);
  const baseName = normalizeForMatch(basePlace.name);
  return Boolean(resultName && baseName && (resultName.includes(baseName) || baseName.includes(resultName)));
}

function normalizeOpenStreetMapResult(result) {
  return {
    name: result.name || result.display_name?.split(',')[0] || '',
    address: result.display_name || '',
    zone: getAddressZone(result.address),
    rawAddress: result.address || {},
    category: result.category || result.class || '',
    type: result.type || '',
    lat: Number(result.lat),
    lng: Number(result.lon),
  };
}

async function searchOpenStreetMap(query, basePlace = {}) {
  if (!query.trim()) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');
  url.searchParams.set('q', query.trim());
  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'user-agent': 'Rumbo personal app',
    },
  });
  if (!response.ok) return null;

  const results = await response.json();
  if (!results.length) return null;

  const normalizedResults = results.map(normalizeOpenStreetMapResult);
  return normalizedResults.find((result) => resultMatchesExpectedLocation(result, basePlace, query)) || normalizedResults[0];
}

async function reverseOpenStreetMap(coordinates) {
  if (!Number.isFinite(Number(coordinates?.lat)) || !Number.isFinite(Number(coordinates?.lng))) return null;

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');
  url.searchParams.set('lat', coordinates.lat);
  url.searchParams.set('lon', coordinates.lng);

  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'user-agent': 'Rumbo personal app',
    },
  });
  if (!response.ok) return null;

  const result = await response.json();
  if (!result) return null;

  return {
    name: result.name || '',
    address: result.display_name || '',
    zone: getAddressZone(result.address),
    rawAddress: result.address || {},
    category: result.category || result.class || '',
    type: result.type || '',
    lat: Number(result.lat),
    lng: Number(result.lon),
  };
}

function formatTripadvisorAddress(address = {}) {
  return [address.street1, address.street2, address.city, address.state, address.country].filter(Boolean).join(', ');
}

async function fetchTripadvisorDetails(basePlace) {
  const apiKey = getTripadvisorApiKey();
  if (!apiKey || !basePlace.tripadvisorLocationId) return null;

  const url = new URL(`https://api.content.tripadvisor.com/api/v1/location/${basePlace.tripadvisorLocationId}/details`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'es');
  url.searchParams.set('currency', 'EUR');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'Rumbo personal app',
      },
    });
    if (!response.ok) return null;

    const result = await response.json();
    const address = formatTripadvisorAddress(result.address_obj || {});
    const lat = Number(result.latitude);
    const lng = Number(result.longitude);

    return {
      name: cleanName(result.name || basePlace.name),
      address: normalizeCityName(address),
      zone: normalizeCityName(result.address_obj?.city || basePlace.zone || ''),
      lat: Number.isFinite(lat) ? lat : '',
      lng: Number.isFinite(lng) ? lng : '',
      rating: Number(result.rating || 0),
      source: 'tripadvisor-api',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function googlePlaceToResult(place, basePlace = {}) {
  const location = place.location || {};
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const name = cleanName(place.displayName?.text || basePlace.name || '');

  return {
    name,
    address: normalizeCityName(place.formattedAddress || ''),
    zone: normalizeCityName(
      place.addressComponents?.find((component) => component.types?.includes('locality'))?.longText || basePlace.zone || '',
    ),
    lat: Number.isFinite(lat) ? lat : '',
    lng: Number.isFinite(lng) ? lng : '',
    source: 'google-places',
  };
}

function googleScore(place, basePlace = {}) {
  const resultName = normalizeForMatch(place.displayName?.text || '');
  const baseName = normalizeForMatch(basePlace.name || '');
  const formattedAddress = normalizeForMatch(place.formattedAddress || '');
  const expectedZone = normalizeForMatch(basePlace.zone || basePlace.address || '');
  let score = 0;

  if (resultName && baseName && resultName === baseName) score += 5;
  else if (resultName && baseName && (resultName.includes(baseName) || baseName.includes(resultName))) score += 3;
  if (expectedZone && formattedAddress.includes(expectedZone)) score += 2;
  return score;
}

async function searchGooglePlaces(basePlace) {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey || !basePlace.name) return null;

  const query = [basePlace.name, basePlace.address, basePlace.zone].filter(Boolean).join(', ');
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
          'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.websiteUri,places.addressComponents,places.primaryType,places.types',
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'es',
        pageSize: 5,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const places = data.places || [];
    if (!places.length) return null;

    const [bestPlace] = places
      .map((place) => ({ place, score: googleScore(place, basePlace) }))
      .filter(({ score }) => score >= 3)
      .sort((a, b) => b.score - a.score);

    return bestPlace ? googlePlaceToResult(bestPlace.place, basePlace) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function enrichPlace(basePlace) {
  if (basePlace.coordinates) {
    const reverseResult = await reverseOpenStreetMap(basePlace.coordinates);
    if (reverseResult) return reverseResult;
  }

  const tripadvisorResult = await fetchTripadvisorDetails(basePlace);
  if (tripadvisorResult && tripadvisorResult.lat !== '' && tripadvisorResult.lng !== '') return tripadvisorResult;

  const googleResult = await searchGooglePlaces(basePlace);
  if (googleResult && googleResult.lat !== '' && googleResult.lng !== '') return googleResult;

  const queries = [
    [basePlace.name, basePlace.zone].filter(Boolean).join(' '),
    [basePlace.name, basePlace.address].filter(Boolean).join(' '),
    [basePlace.name, normalizeCityName(basePlace.zone)].filter(Boolean).join(' '),
    basePlace.name,
  ].filter(Boolean);

  for (const query of [...new Set(queries)]) {
    const result = await searchOpenStreetMap(query, basePlace);
    if (result && isSpecificEnough(result, basePlace, query)) {
      return {
        ...result,
        address: result.address,
        zone: getAddressZone(result.rawAddress) || basePlace.zone || result.zone,
        source: 'geocoding',
      };
    }
  }

  return tripadvisorResult || googleResult;
}

export async function buildImportedPlace(rawUrl, options = {}) {
  const fetched = await fetchSafeHtml(rawUrl, options);
  const normalizedUrl = fetched.finalUrl;
  const resolvedUrl = fetched.finalUrl || normalizedUrl;
  const sourceType = inferSource(`${normalizedUrl} ${resolvedUrl}`);
  const metadata = fetched.ok ? parseMetadata(fetched.html) : {};

  let parsed = {
    name: metadata.name,
    address: metadata.address,
    zone: '',
    coordinates: extractCoordinatesFromText(`${resolvedUrl} ${fetched.html}`),
  };

  if (sourceType === 'google') parsed = { ...parsed, ...parseGoogleUrl(resolvedUrl) };
  if (sourceType === 'tripadvisor') parsed = { ...parsed, ...parseTripadvisorUrl(resolvedUrl) };

  const enriched = await enrichPlace(parsed);
  const name = cleanName(parsed.name || enriched?.name || 'Lugar importado');
  const address = enriched?.address || parsed.address || [name, parsed.zone].filter(Boolean).join(', ');
  const zone = enriched?.zone || parsed.zone || '';
  const lat = enriched?.lat ?? parsed.coordinates?.lat ?? '';
  const lng = enriched?.lng ?? parsed.coordinates?.lng ?? '';
  const category = inferPlaceCategory({ name, type: enriched?.category || '' });

  return {
    title: name,
    address,
    zone,
    lat,
    lng,
    category,
    tags: normalizePlaceTags(inferTags(`${name} ${resolvedUrl}`), category),
    rating: 0,
    sourceType,
    sourceUrl: normalizedUrl,
    resolvedUrl,
  };
}

const importRateLimiter = createBestEffortRateLimiter();

function getClientIp(request) {
  return String(request.headers?.['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function getFirebaseProjectId() {
  return getServerEnv('FIREBASE_PROJECT_ID') || getServerEnv('VITE_FIREBASE_PROJECT_ID');
}

function toPublicImportError(error) {
  if (error instanceof ImportSecurityError) return error;
  const message = String(error?.message || '');
  if (/^(Pega|Solo se aceptan|No parece|El enlace no puede incluir|Solo se aceptan enlaces)/.test(message)) {
    return new ImportSecurityError(400, message);
  }
  if (/token|sesión|Firebase|autenticación/i.test(message)) {
    return new ImportSecurityError(401, 'Tu sesión no es válida. Vuelve a iniciar sesión.');
  }
  return new ImportSecurityError(502, 'No se pudo consultar el enlace en este momento.');
}

export function createImportHandler({ rateLimiter = importRateLimiter, verifyToken = verifyFirebaseIdToken, buildPlace = buildImportedPlace } = {}) {
  return async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = request.headers?.['x-vercel-id'] || '';
  if (request.method !== 'POST') {
    console.warn(JSON.stringify({ level: 'warning', message: 'import_method_rejected', requestId, method: request.method }));
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body;
    const ipRate = rateLimiter.check(`ip:${getClientIp(request)}`);
    if (!ipRate.allowed) {
      response.setHeader('Retry-After', String(ipRate.retryAfter));
      response.status(429).json({ error: 'Has hecho demasiadas importaciones. Espera antes de reintentar.' });
      return;
    }
    const authorization = request.headers?.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const identity = await verifyToken(token, { projectId: getFirebaseProjectId() });
    const userRate = rateLimiter.check(`user:${identity.uid}`);
    if (!userRate.allowed) {
      response.setHeader('Retry-After', String(userRate.retryAfter));
      response.status(429).json({ error: 'Has hecho demasiadas importaciones. Espera antes de reintentar.' });
      return;
    }
    console.log(JSON.stringify({ level: 'info', message: 'import_started', requestId }));
    const place = await buildPlace(body?.url || '');
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'import_completed',
        requestId,
        durationMs: Date.now() - startedAt,
        sourceType: place.sourceType,
        resolved: Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)),
      }),
    );
    response.status(200).json(place);
  } catch (error) {
    const publicError = toPublicImportError(error);
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'import_failed',
        requestId,
        durationMs: Date.now() - startedAt,
        error: error?.message || 'Unknown import error',
      }),
    );
    response.status(publicError.status).json({ error: publicError.message });
  }
}
}

export default createImportHandler();
