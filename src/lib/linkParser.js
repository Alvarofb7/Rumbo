const sourceMatchers = [
  { sourceType: 'instagram', patterns: ['instagram.com'] },
  { sourceType: 'tripadvisor', patterns: ['tripadvisor.'] },
  { sourceType: 'apple', patterns: ['maps.apple.com'] },
  { sourceType: 'google', patterns: ['google.com/maps', 'maps.google.', 'goo.gl/maps', 'maps.app.goo.gl'] },
];

function cleanTitle(value) {
  let decoded = value || '';

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = value || '';
  }

  return decoded
    .replace(/[-_+]/g, ' ')
    .replace(/\s*\|\s*(restaurante|restaurant|bar|caf[eé]).*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\bRestaurant Review\b/gi, '')
    .replace(/\bTourism\b/gi, '')
    .replace(/\bOpiniones\b.*$/i, '')
    .replace(/\bReviews\b.*$/i, '')
    .trim();
}

export function inferSourceType(url) {
  const lower = url.toLowerCase();
  return sourceMatchers.find((matcher) => matcher.patterns.some((pattern) => lower.includes(pattern)))?.sourceType || 'manual';
}

function extractCoordinatesFromText(text) {
  const bangMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bangMatch) return { lat: Number(bangMatch[1]), lng: Number(bangMatch[2]) };

  const llMatch = text.match(/[?&](?:ll|sll|q)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (llMatch) return { lat: Number(llMatch[1]), lng: Number(llMatch[2]) };

  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) };

  return null;
}

function inferTripadvisorTitle(pathname) {
  const path = pathname.split('/').filter(Boolean).at(-1) || '';
  const withoutExtension = path.replace(/\.html?$/i, '');
  const afterReviews = withoutExtension.split(/-Reviews-/i)[1] || withoutExtension;
  const [rawName] = afterReviews.split('-');
  return cleanTitle(rawName);
}

function inferTitle(parsedUrl, sourceType) {
  const params = parsedUrl.searchParams;

  if (params.get('q') && !params.get('q').match(/^-?\d/)) return cleanTitle(params.get('q'));
  if (params.get('query')) return cleanTitle(params.get('query'));

  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  if (sourceType === 'tripadvisor') {
    return inferTripadvisorTitle(parsedUrl.pathname) || 'Lugar de Tripadvisor';
  }

  if (sourceType === 'instagram') return 'Recomendación de Instagram';

  const placeIndex = pathParts.findIndex((part) => ['place', 'search'].includes(part.toLowerCase()));
  if (placeIndex >= 0 && pathParts[placeIndex + 1]) return cleanTitle(pathParts[placeIndex + 1]);

  return cleanTitle(pathParts.at(-1)) || 'Lugar importado';
}

function inferTags(title) {
  const lower = title.toLowerCase();
  const tags = [];

  if (lower.includes('terraza')) tags.push('Terraza');
  if (lower.includes('tapas')) tags.push('Tapas');
  if (lower.includes('brunch')) tags.push('Brunch');
  if (/\b(desayuno|breakfast)\b/.test(lower)) tags.push('Desayuno');
  if (lower.includes('vino')) tags.push('Vino');
  if (/\b(sushi|japon[eé]s|japones|ramen|omakase)\b/.test(lower)) tags.push('Sushi');
  if (/\b(carne|parrilla|asador|steak|grill)\b/.test(lower)) tags.push('Carne');
  if (/\b(pescado|marisco|marisquer[ií]a|seafood)\b/.test(lower)) tags.push('Pescado');
  if (/\b(pizza|pizzer[ií]a)\b/.test(lower)) tags.push('Pizza');
  if (/\b(pasta|italian[oa])\b/.test(lower)) tags.push('Italiano');
  if (/\b(mexican[oa]|taco|taquer[ií]a)\b/.test(lower)) tags.push('Mexicano');
  if (/\b(hamburguesa|burger)\b/.test(lower)) tags.push('Hamburguesa');
  if (/\b(vegano|vegana|vegan|vegetarian[oa])\b/.test(lower)) tags.push('Vegano');
  if (/\b(barato|econ[oó]mico|cheap)\b/.test(lower)) tags.push('Barato');
  if (/\b(medio|moderado|normal)\b/.test(lower)) tags.push('Medio');
  if (/\b(caro|cara|premium|fine dining|capricho)\b/.test(lower)) tags.push('Caro');
  if (/\b(cita|rom[aá]ntico|romantico|date)\b/.test(lower)) tags.push('Cita');

  return tags;
}

export function parsePlaceLink(rawUrl, fallbackPosition = null) {
  const input = rawUrl.trim();
  if (!input) throw new Error('Pega un enlace válido.');

  const normalizedUrl = input.startsWith('http') ? input : `https://${input}`;
  let parsedUrl;

  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    throw new Error('No parece un enlace válido.');
  }

  const sourceType = inferSourceType(normalizedUrl);
  const title = inferTitle(parsedUrl, sourceType);
  const coordinates = extractCoordinatesFromText(normalizedUrl) || fallbackPosition;
  const category = inferPlaceCategory({ name: title });

  return {
    title,
    address: sourceType === 'instagram' ? 'Completa la dirección al guardar' : title,
    zone: '',
    lat: coordinates?.lat ?? '',
    lng: coordinates?.lng ?? '',
    category,
    tags: normalizePlaceTags(inferTags(title), category),
    rating: 0,
    sourceType,
    sourceUrl: normalizedUrl,
  };
}
import { inferPlaceCategory, normalizePlaceTags } from './placeData';
