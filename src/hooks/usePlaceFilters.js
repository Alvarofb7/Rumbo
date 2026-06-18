import { useMemo } from 'react';
import { distanceInMeters, normalizePosition } from '../lib/geo';
import { getCategoryLabel } from '../lib/placeData';

export function usePlaceFilters(places, filters, userPosition) {
  return useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const zone = filters.zone.trim().toLowerCase();
    const tags = filters.tags;

    const filtered = places.filter((place) => {
      const haystack = [place.name, place.address, place.zone, getCategoryLabel(place.category), ...(place.tags || [])].join(' ').toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesZone = !zone || (place.zone || '').toLowerCase().includes(zone);
      const matchesStatus = filters.status === 'all' || place.status === filters.status;
      const matchesRating = Number(place.rating || 0) >= filters.minRating;
      const matchesTags = tags.length === 0 || tags.every((tag) => (place.tags || []).includes(tag));
      return matchesSearch && matchesZone && matchesStatus && matchesRating && matchesTags;
    });

    const enriched = filtered.map((place) => ({
      ...place,
      distance: distanceInMeters(userPosition, normalizePosition(place, { lat: Number.NaN, lng: Number.NaN })),
    }));

    return enriched.sort((a, b) => {
      if (filters.sort === 'nearest') return a.distance - b.distance;
      if (filters.sort === 'ranking') return Number(b.rating || 0) - Number(a.rating || 0);
      if (filters.sort === 'zone') return (a.zone || '').localeCompare(b.zone || '') || a.distance - b.distance;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [filters, places, userPosition]);
}
