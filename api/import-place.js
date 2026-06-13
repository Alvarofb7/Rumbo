const defaultImages = {
  google: '/media/cafe-recommendation.jpg',
  apple: '/media/cafe-recommendation.jpg',
  instagram: '/media/cafe-recommendation.jpg',
  tripadvisor: '/media/tapas-recommendation.jpg',
  manual: '/media/cafe-recommendation.jpg',
};

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
    .replace(/\bProvince of\b.*$/i, '')
    .trim();
}

function normalizeUrl(rawUrl) {
  const input = rawUrl.trim();
  if (!input) throw new Error('Pega un enlace válido.');
  return input.startsWith('http') ? input : `https://${input}`;
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

function inferTags(sourceType, name = '') {
  const lower = name.toLowerCase();
  const tags = [];

  if (lower.includes('coffee') || lower.includes('café') || lower.includes('cafe')) tags.push('Café');
  if (lower.includes('bar') || lower.includes('bodega')) tags.push('Bar');
  if (lower.includes('restaurant') || lower.includes('restaurante') || sourceType === 'tripadvisor') tags.push('Restaurante');
  if (sourceType === 'instagram') tags.push('Pendiente');

  return tags.length ? tags : ['Pendiente'];
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

  return {
    name: cleanName(rawName),
    zone: city,
    address: [cleanName(rawName), city].filter(Boolean).join(', '),
    coordinates: extractCoordinatesFromText(url),
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

async function fetchExpandedUrl(url, { timeoutMs = 9000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'es,en;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; RumboPersonalApp/1.0)',
      },
    });
    const html = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      html,
    };
  } catch {
    return { ok: false, status: 0, finalUrl: url, html: '' };
  } finally {
    clearTimeout(timeoutId);
  }
}

function stripTags(value = '') {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function cleanExtractedAddress(value = '') {
  return normalizeCityName(
    cleanText(value)
      .replace(/\s+(?:Opening hours|Phone|Website|Email|Directions?):.*$/i, '')
      .replace(/\s+Save Review Share.*$/i, '')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ',')
      .trim(),
  );
}

function extractAddressFromText(value = '') {
  const text = stripTags(value);
  const labelledAddressMatch = text.match(
    /\bAddress:\s*([^\n]{3,180}?)(?:\s+(?:Opening hours|Phone|Website|Email|Directions?|Similar places|Nearby):|$)/i,
  );
  if (labelledAddressMatch) return cleanExtractedAddress(labelledAddressMatch[1]);

  const locatedAtMatch = text.match(/\blocated at\s+([^.!?]{3,180}?\b(?:Spain|España)\b)/i);
  if (locatedAtMatch) return cleanExtractedAddress(locatedAtMatch[1]);

  const addressMatch = text.match(
    /\b(?:C\.|C\/|Calle|Av\.|Avenida|Paseo|Plaza|Pza\.|Ronda|Camino|Carretera)\s+[^:;()|\n]{3,100}?,\s*\d+[A-Za-z]?(?:,\s*\d{5}\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+)?\b/i,
  );

  return addressMatch ? cleanExtractedAddress(addressMatch[0]) : '';
}

function extractSearchResultLinks(html = '') {
  return [...html.matchAll(/uddg=([^&"']+)/gi)]
    .map((match) => {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return '';
      }
    })
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url) => !url.includes('tripadvisor.') && !url.includes('google.') && !url.includes('duckduckgo.'))
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, 5);
}

async function fetchReadablePage(url, timeoutMs = 5000) {
  const readerUrl = `https://r.jina.ai/http://${url}`;
  const fetched = await fetchExpandedUrl(readerUrl, { timeoutMs });
  return fetched.ok ? fetched.html : '';
}

function appendZone(address = '', zone = '') {
  if (!address || !zone) return address || zone;
  return normalizeForMatch(address).includes(normalizeForMatch(zone)) ? address : [address, zone].join(', ');
}

function slugify(value = '') {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getEnglishCitySlug(value = '') {
  const normalizedCity = normalizeForMatch(normalizeCityName(value));
  if (normalizedCity === 'sevilla') return 'seville';
  return slugify(value);
}

function getLikelyPublicPages(basePlace) {
  const placeSlug = normalizeForMatch(basePlace.name);
  const citySlug = getEnglishCitySlug(basePlace.zone || basePlace.address);
  if (!placeSlug || placeSlug.length < 3) return [];

  return [
    `https://${placeSlug}.menustic.com/`,
    citySlug ? `https://intravel.net/${citySlug}/restaurants-cafes/${placeSlug}` : '',
  ].filter(Boolean);
}

async function searchLikelyPublicPages(basePlace) {
  const likelyPages = getLikelyPublicPages(basePlace);
  if (!likelyPages.length) return null;

  const pageResults = await Promise.allSettled(
    likelyPages.map(async (pageUrl) => {
      const readablePage = await fetchReadablePage(pageUrl, 3500);
      const address = extractAddressFromText(readablePage);
      return address ? { address, pageUrl } : null;
    }),
  );

  const match = pageResults.find((result) => result.status === 'fulfilled' && result.value?.address)?.value;
  if (!match) return null;

  const zone = normalizeCityName(basePlace.zone || '');
  return {
    name: basePlace.name,
    address: appendZone(match.address, zone),
    zone,
    source: 'web pública',
  };
}

async function searchPublicWeb(basePlace) {
  const publicPageResult = await searchLikelyPublicPages(basePlace);
  if (publicPageResult) return publicPageResult;

  const query = [basePlace.name, basePlace.zone || basePlace.address, 'restaurante dirección'].filter(Boolean).join(' ');
  if (!query.trim()) return null;

  const url = new URL('https://duckduckgo.com/html/');
  url.searchParams.set('q', query);

  const fetched = await fetchExpandedUrl(url.toString(), { timeoutMs: 5000 });
  if (!fetched.ok || !fetched.html) return null;

  const snippets = [...fetched.html.matchAll(/class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1]);
  const fallbackText = fetched.html.slice(0, 50000);
  let address = snippets.map(extractAddressFromText).find(Boolean) || extractAddressFromText(fallbackText);

  if (!address) {
    const resultLinks = extractSearchResultLinks(fetched.html);
    for (const resultLink of resultLinks) {
      const readablePage = await fetchReadablePage(resultLink, 3000);
      address = extractAddressFromText(readablePage);
      if (address) break;
    }
  }

  if (!address) return null;

  return {
    name: basePlace.name,
    address: appendZone(address, basePlace.zone),
    zone: basePlace.zone || '',
    source: 'búsqueda web',
  };
}

function normalizeForMatch(value = '') {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
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
  if (isAddressQuery(query)) return true;
  if (isBroadPlaceResult(result)) return false;

  const resultName = normalizeForMatch(result.name);
  const baseName = normalizeForMatch(basePlace.name);
  return Boolean(resultName && baseName && (resultName.includes(baseName) || baseName.includes(resultName)));
}

async function searchOpenStreetMap(query) {
  if (!query.trim()) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
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

  const [result] = await response.json();
  if (!result) return null;

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

async function enrichPlace(basePlace) {
  if (basePlace.coordinates) {
    const reverseResult = await reverseOpenStreetMap(basePlace.coordinates);
    if (reverseResult) return reverseResult;
  }

  const webResult = await searchPublicWeb(basePlace);
  const queries = [
    [basePlace.name, basePlace.zone].filter(Boolean).join(' '),
    [basePlace.name, basePlace.address].filter(Boolean).join(' '),
    [basePlace.name, normalizeCityName(basePlace.zone)].filter(Boolean).join(' '),
    [basePlace.name, webResult?.address].filter(Boolean).join(' '),
    webResult?.address,
    [webResult?.address, normalizeCityName(basePlace.zone)].filter(Boolean).join(' '),
    basePlace.name,
  ].filter(Boolean);

  for (const query of [...new Set(queries)]) {
    const result = await searchOpenStreetMap(query);
    if (result && isSpecificEnough(result, basePlace, query)) {
      return {
        ...result,
        address: webResult?.address || result.address,
        zone: getAddressZone(result.rawAddress) || basePlace.zone || webResult?.zone || result.zone,
        source: webResult?.source || 'geocoding',
      };
    }
  }

  return webResult;
}

export async function buildImportedPlace(rawUrl) {
  const normalizedUrl = normalizeUrl(rawUrl);
  const fetched = await fetchExpandedUrl(normalizedUrl);
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

  return {
    title: name,
    address,
    zone,
    lat,
    lng,
    tags: inferTags(sourceType, `${name} ${resolvedUrl}`),
    rating: 0,
    sourceType,
    sourceUrl: normalizedUrl,
    resolvedUrl,
    imageUrl: defaultImages[sourceType] || defaultImages.manual,
    notes: enriched
      ? `Importado desde ${sourceType === 'tripadvisor' ? 'Tripadvisor' : sourceType === 'google' ? 'Google Maps' : 'enlace'} con ubicación detectada.`
      : 'Importado desde enlace. Revisa la ubicación antes de guardar.',
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body;
    const place = await buildImportedPlace(body?.url || '');
    response.status(200).json(place);
  } catch (error) {
    response.status(400).json({ error: error.message || 'No se pudo importar el enlace.' });
  }
}
