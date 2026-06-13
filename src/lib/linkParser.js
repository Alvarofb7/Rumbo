const sourceMatchers = [
  { sourceType: 'instagram', patterns: ['instagram.com'] },
  { sourceType: 'tripadvisor', patterns: ['tripadvisor.'] },
  { sourceType: 'apple', patterns: ['maps.apple.com'] },
  { sourceType: 'google', patterns: ['google.com/maps', 'maps.google.', 'goo.gl/maps', 'maps.app.goo.gl'] },
];

function cleanTitle(value) {
  return decodeURIComponent(value || '')
    .replace(/[-_+]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bRestaurant Review\b/gi, '')
    .replace(/\bTourism\b/gi, '')
    .trim();
}

function inferSource(url) {
  const lower = url.toLowerCase();
  return sourceMatchers.find((matcher) => matcher.patterns.some((pattern) => lower.includes(pattern)))?.sourceType || 'manual';
}

function extractCoordinatesFromText(text) {
  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) };

  const bangMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bangMatch) return { lat: Number(bangMatch[1]), lng: Number(bangMatch[2]) };

  const llMatch = text.match(/[?&](?:ll|sll|q)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (llMatch) return { lat: Number(llMatch[1]), lng: Number(llMatch[2]) };

  return null;
}

function inferTitle(parsedUrl, sourceType) {
  const params = parsedUrl.searchParams;

  if (params.get('q') && !params.get('q').match(/^-?\d/)) return cleanTitle(params.get('q'));
  if (params.get('query')) return cleanTitle(params.get('query'));

  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  if (sourceType === 'tripadvisor') {
    const candidate = pathParts.find((part) => part.includes('Restaurant') || part.includes('Attraction')) || pathParts.at(-1);
    return cleanTitle(candidate);
  }

  if (sourceType === 'instagram') return 'Recomendación de Instagram';

  const placeIndex = pathParts.findIndex((part) => ['place', 'search'].includes(part.toLowerCase()));
  if (placeIndex >= 0 && pathParts[placeIndex + 1]) return cleanTitle(pathParts[placeIndex + 1]);

  return cleanTitle(pathParts.at(-1)) || 'Lugar importado';
}

function inferTags(sourceType, title) {
  const lower = title.toLowerCase();
  const tags = [];

  if (lower.includes('coffee') || lower.includes('café') || lower.includes('cafe')) tags.push('Café');
  if (lower.includes('bar') || lower.includes('bodega')) tags.push('Bar');
  if (lower.includes('restaurant') || lower.includes('restaurante')) tags.push('Restaurante');
  if (sourceType === 'instagram') tags.push('Pendiente');
  if (sourceType === 'tripadvisor') tags.push('Ranking');

  return tags.length ? tags : ['Pendiente'];
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

  const sourceType = inferSource(normalizedUrl);
  const title = inferTitle(parsedUrl, sourceType);
  const coordinates = extractCoordinatesFromText(normalizedUrl) || fallbackPosition;

  return {
    title,
    address: sourceType === 'instagram' ? 'Completa la dirección al guardar' : title,
    zone: '',
    lat: coordinates?.lat ?? '',
    lng: coordinates?.lng ?? '',
    tags: inferTags(sourceType, title),
    rating: 0,
    sourceType,
    sourceUrl: normalizedUrl,
    imageUrl: sourceType === 'tripadvisor' ? '/media/tapas-recommendation.jpg' : '/media/cafe-recommendation.jpg',
    notes: sourceType === 'instagram' ? 'Recomendación guardada desde un vídeo.' : 'Importado desde enlace.',
  };
}
