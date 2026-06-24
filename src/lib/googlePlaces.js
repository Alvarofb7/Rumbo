import { hasGoogleMapsConfig, importGoogleLibrary } from './googleMaps';
import { categoryFromGoogleType, tagsFromGoogleTypes } from './placeData';

const zoneTypePriority = [
  'neighborhood',
  'sublocality_level_1',
  'sublocality',
  'locality',
  'administrative_area_level_2',
  'administrative_area_level_1',
];

const placeDetailFields = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'addressComponents',
  'primaryType',
  'types',
  'googleMapsURI',
];

function hasCoordinates(position) {
  return Number.isFinite(Number(position?.lat)) && Number.isFinite(Number(position?.lng));
}

function normalizeBounds(bounds) {
  if (!bounds) return null;
  const normalized = {
    north: Number(bounds.north),
    south: Number(bounds.south),
    east: Number(bounds.east),
    west: Number(bounds.west),
  };

  return Object.values(normalized).every(Number.isFinite) ? normalized : null;
}

function boundsAround(position, span = 0.22) {
  if (!hasCoordinates(position)) return null;
  return {
    north: Number(position.lat) + span,
    south: Number(position.lat) - span,
    east: Number(position.lng) + span,
    west: Number(position.lng) - span,
  };
}

function textValue(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : value.toString?.() || '';
}

function getZone(addressComponents = []) {
  for (const type of zoneTypePriority) {
    const component = addressComponents.find((item) => item.types?.includes(type));
    if (component?.longText || component?.shortText) return component.longText || component.shortText;
  }
  return '';
}

function categoryFromProviderTypes(types = []) {
  return types.map(categoryFromGoogleType).find((category) => category !== 'other') || 'other';
}

function placeToResult(place) {
  const lat = place.location?.lat?.();
  const lng = place.location?.lng?.();
  const providerTypes = [place.primaryType, ...(place.types || [])].filter(Boolean);
  const category = categoryFromProviderTypes(providerTypes);

  return {
    id: place.id,
    providerPlaceId: place.id,
    name: place.displayName || place.formattedAddress?.split(',')[0] || 'Lugar',
    address: place.formattedAddress || '',
    zone: getZone(place.addressComponents),
    lat: Number(lat),
    lng: Number(lng),
    type: providerTypes[0] || '',
    providerType: providerTypes[0] || '',
    types: providerTypes,
    category,
    tags: tagsFromGoogleTypes(providerTypes),
    sourceUrl: place.googleMapsURI || '',
    source: 'google-places',
    resolved: true,
  };
}

export async function resolveGooglePlaceId(placeId) {
  if (!placeId) throw new Error('Google Maps no ha identificado este lugar.');
  if (!hasGoogleMapsConfig()) throw new Error('Falta configurar Google Maps para consultar este lugar.');

  try {
    const { Place } = await importGoogleLibrary('places');
    const place = new Place({ id: placeId });
    await place.fetchFields({ fields: placeDetailFields });
    return placeToResult(place);
  } catch {
    throw new Error('No se han podido cargar los detalles de este lugar.');
  }
}

export async function resolveGooglePlaceAt(position, radius = 90) {
  if (!hasCoordinates(position)) return null;
  if (!hasGoogleMapsConfig()) throw new Error('Falta configurar Google Maps para consultar este lugar.');

  try {
    const { Place, SearchNearbyRankPreference } = await importGoogleLibrary('places');
    const { places = [] } = await Place.searchNearby({
      fields: placeDetailFields,
      locationRestriction: {
        center: { lat: Number(position.lat), lng: Number(position.lng) },
        radius,
      },
      maxResultCount: 1,
      rankPreference: SearchNearbyRankPreference.DISTANCE,
    });
    return places[0] ? placeToResult(places[0]) : null;
  } catch {
    throw new Error('No se ha podido identificar un lugar cerca de ese punto.');
  }
}

export function createPlaceSearchSession() {
  return { token: null };
}

export function resetPlaceSearchSession(session) {
  if (session) session.token = null;
}

async function getSessionToken(session, AutocompleteSessionToken) {
  if (!session) return new AutocompleteSessionToken();
  if (!session.token) session.token = new AutocompleteSessionToken();
  return session.token;
}

async function textSearch(query, options = {}) {
  const { Place } = await importGoogleLibrary('places');
  const center = options.center || options;
  const bounds = normalizeBounds(options.bounds) || boundsAround(center);
  const request = {
    textQuery: query,
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents', 'primaryType', 'types'],
    language: 'es',
    region: 'es',
    maxResultCount: 8,
  };

  if (bounds) {
    request.locationBias = bounds;
  }

  const { places = [] } = await Place.searchByText(request);
  return places.map(placeToResult).filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lng));
}

export async function searchLocation(query, options = {}) {
  const input = query.trim();
  if (input.length < 2) return [];
  if (!hasGoogleMapsConfig()) throw new Error('Falta configurar Google Maps para activar la búsqueda.');

  try {
    const { AutocompleteSessionToken, AutocompleteSuggestion } = await importGoogleLibrary('places');
    const center = options.center || options;
    const bounds = normalizeBounds(options.bounds) || boundsAround(center);
    const request = {
      input,
      language: 'es',
      region: 'es',
      sessionToken: await getSessionToken(options.session, AutocompleteSessionToken),
    };

    if (hasCoordinates(center)) request.origin = { lat: Number(center.lat), lng: Number(center.lng) };
    if (bounds) {
      request.locationBias = bounds;
    }

    const { suggestions = [] } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
    const predictions = suggestions
      .map((suggestion) => suggestion.placePrediction)
      .filter(Boolean)
      .slice(0, 8)
      .map((prediction) => ({
        id: prediction.placeId,
        providerPlaceId: prediction.placeId,
        name: textValue(prediction.mainText) || textValue(prediction.text),
        address: textValue(prediction.secondaryText),
        distanceMeters: Number(prediction.distanceMeters || 0),
        types: prediction.types || [],
        providerType: prediction.types?.[0] || '',
        category: categoryFromProviderTypes(prediction.types || []),
        tags: tagsFromGoogleTypes(prediction.types || []),
        source: 'google-places',
        prediction,
      }));

    if (predictions.length || !options.allowTextSearch) return predictions;
    resetPlaceSearchSession(options.session);
    return textSearch(input, options);
  } catch (error) {
    const message = error?.message || '';
    if (/api key|billing|denied|referer|referer|authorized/i.test(message)) {
      throw new Error('Google Places no está configurado correctamente. Revisa la clave, facturación y restricciones.');
    }
    throw new Error('No se pudo buscar en Google Places. Inténtalo de nuevo.');
  }
}

export async function resolveLocationSuggestion(result, session) {
  if (!result) return null;
  if (result.resolved && Number.isFinite(result.lat) && Number.isFinite(result.lng)) {
    resetPlaceSearchSession(session);
    return result;
  }
  if (!result.prediction) throw new Error('El resultado seleccionado no contiene datos suficientes.');

  try {
    const place = result.prediction.toPlace();
    await place.fetchFields({
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents', 'primaryType', 'types'],
    });
    resetPlaceSearchSession(session);
    return placeToResult(place);
  } catch {
    throw new Error('No se pudieron obtener los detalles de ese lugar.');
  }
}
