const editableFields = ['title', 'address', 'zone', 'category', 'tags', 'rating'];
const coordinateQualities = new Set(['exact', 'geocoded', 'approximate', 'missing']);

function hasCoordinates(place) {
  return place?.lat !== '' && place?.lng !== '' && place?.lat != null && place?.lng != null && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng));
}

export function normalizeImportPreview(input = {}) {
  const place = input.place || {};
  const provenance = input.provenance || 'local_parser';
  const coordinateQuality = hasCoordinates(place) ? (coordinateQualities.has(input.coordinateQuality) ? input.coordinateQuality : provenance === 'geocoder' ? 'geocoded' : 'exact') : 'missing';
  const confidence = input.confidence || (coordinateQuality === 'exact' && provenance === 'official_api' ? 'high' : coordinateQuality === 'geocoded' ? 'medium' : 'low');
  const warnings = [...new Set([
    ...(input.warnings || []),
    ...(coordinateQuality === 'missing' ? ['MISSING_COORDINATES'] : []),
    ...(input.ambiguity ? ['AMBIGUOUS_MATCH'] : []),
    ...(coordinateQuality === 'approximate' ? ['APPROXIMATE_COORDINATES'] : []),
    ...(provenance === 'metadata' ? ['METADATA_ONLY'] : []),
    ...(provenance === 'local_parser' ? ['LOCAL_FALLBACK'] : []),
  ])];
  return {
    source: { provider: input.source?.provider || 'manual', inputUrl: input.source?.inputUrl || '', canonicalUrl: input.source?.canonicalUrl || '', resolvedUrl: input.source?.resolvedUrl || '', providerId: input.source?.providerId || '' },
    place: { title: String(place.title || ''), address: String(place.address || ''), zone: String(place.zone || ''), lat: hasCoordinates(place) ? Number(place.lat) : '', lng: hasCoordinates(place) ? Number(place.lng) : '', category: place.category || 'other', tags: Array.isArray(place.tags) ? place.tags : [], rating: Number(place.rating || 0) },
    quality: { confidence, coordinateQuality, provenance, warnings, ambiguity: Boolean(input.ambiguity), verified: confidence === 'high' && coordinateQuality === 'exact' && provenance === 'official_api' },
    duplicate: { status: 'unchecked', matchedCollection: null, matchedId: null, reasons: [] },
    editableFields,
  };
}
