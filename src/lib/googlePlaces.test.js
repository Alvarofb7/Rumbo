import { beforeEach, describe, expect, it, vi } from 'vitest';

const googleMapsMocks = vi.hoisted(() => ({
  hasGoogleMapsConfig: vi.fn(() => true),
  importGoogleLibrary: vi.fn(),
}));

vi.mock('./googleMaps', () => googleMapsMocks);

import {
  createPlaceSearchSession,
  resolveLocationSuggestion,
  searchLocation,
} from './googlePlaces';

class AutocompleteSessionToken {}

const sevillaBounds = {
  north: 37.52,
  south: 37.25,
  east: -5.75,
  west: -6.15,
};

function prediction(overrides = {}) {
  return {
    placeId: 'place-seis',
    mainText: { toString: () => 'Seis' },
    secondaryText: { toString: () => 'Plaza Nueva, Sevilla' },
    text: { toString: () => 'Seis, Plaza Nueva, Sevilla' },
    types: ['restaurant'],
    ...overrides,
  };
}

describe('Google Places search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleMapsMocks.hasGoogleMapsConfig.mockReturnValue(true);
  });

  it('restricts place creation to the visible map bounds', async () => {
    const fetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
      suggestions: [{ placePrediction: prediction() }],
    });
    googleMapsMocks.importGoogleLibrary.mockResolvedValue({
      AutocompleteSessionToken,
      AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    });

    const results = await searchLocation('Seis Tapas Sevilla', {
      mode: 'place',
      bounds: sevillaBounds,
      center: { lat: 37.3891, lng: -5.9845 },
      session: createPlaceSearchSession(),
    });

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'Seis Tapas Sevilla',
        locationRestriction: sevillaBounds,
        origin: { lat: 37.3891, lng: -5.9845 },
      }),
    );
    expect(fetchAutocompleteSuggestions.mock.calls[0][0]).not.toHaveProperty('locationBias');
    expect(results[0]).toMatchObject({ name: 'Seis', address: 'Plaza Nueva, Sevilla', source: 'google-places' });
  });

  it('biases map navigation without blocking travel elsewhere', async () => {
    const fetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
      suggestions: [{ placePrediction: prediction({ placeId: 'place-paris' }) }],
    });
    googleMapsMocks.importGoogleLibrary.mockResolvedValue({
      AutocompleteSessionToken,
      AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    });

    await searchLocation('París', {
      mode: 'destination',
      bounds: sevillaBounds,
      center: { lat: 37.3891, lng: -5.9845 },
      session: createPlaceSearchSession(),
    });

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ locationBias: sevillaBounds }),
    );
    expect(fetchAutocompleteSuggestions.mock.calls[0][0]).not.toHaveProperty('locationRestriction');
  });

  it('resolves a selected prediction into exact coordinates', async () => {
    const place = {
      id: 'place-seis',
      displayName: 'Seis',
      formattedAddress: 'Plaza Nueva, 7, 41001 Sevilla, España',
      location: { lat: () => 37.388222, lng: () => -5.9963925 },
      addressComponents: [{ longText: 'Sevilla', types: ['locality'] }],
      primaryType: 'restaurant',
      types: ['restaurant'],
      fetchFields: vi.fn().mockResolvedValue(undefined),
    };
    const placePrediction = prediction({ toPlace: () => place });
    const session = createPlaceSearchSession();
    session.token = new AutocompleteSessionToken();

    const result = await resolveLocationSuggestion({ prediction: placePrediction }, session);

    expect(place.fetchFields).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      providerPlaceId: 'place-seis',
      name: 'Seis',
      zone: 'Sevilla',
      lat: 37.388222,
      lng: -5.9963925,
    });
    expect(session.token).toBeNull();
  });
});
