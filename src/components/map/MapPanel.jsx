import { useEffect, useRef, useState } from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import { defaultCenter } from '../../data/demoData';
import { captureDiagnostic, recordBreadcrumb } from '../../lib/diagnostics';
import { importGoogleLibrary } from '../../lib/googleMaps';
import { getPlaceColor } from '../common/placeUtils';

function hasValidCoordinate(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function hasValidCoordinates(place) {
  return hasValidCoordinate(place?.lat) && hasValidCoordinate(place?.lng);
}

function numericPosition(position) {
  return { lat: Number(position.lat), lng: Number(position.lng) };
}

export function getPlacesCenter(places = []) {
  const positionedPlaces = places.filter(hasValidCoordinates);
  if (!positionedPlaces.length) return null;
  const totals = positionedPlaces.reduce(
    (result, place) => ({ lat: result.lat + Number(place.lat), lng: result.lng + Number(place.lng) }),
    { lat: 0, lng: 0 },
  );
  return { lat: totals.lat / positionedPlaces.length, lng: totals.lng / positionedPlaces.length };
}

export function getInitialMapView({ center, userPosition, places = [] }) {
  if (hasValidCoordinates(center)) return { center: numericPosition(center), zoom: 14 };
  if (hasValidCoordinates(userPosition)) return { center: numericPosition(userPosition), zoom: 14 };
  const placesCenter = getPlacesCenter(places);
  if (placesCenter) return { center: placesCenter, zoom: 12 };
  return { center: defaultCenter, zoom: 6 };
}

function createMarkerContent({ color, selected = false, current = false }) {
  const marker = document.createElement('div');
  marker.className = current ? 'rumbo-google-marker rumbo-google-marker--current' : 'rumbo-google-marker';
  marker.style.setProperty('--marker-color', color);
  marker.style.setProperty('--marker-size', `${selected ? 28 : current ? 22 : 22}px`);
  marker.setAttribute('aria-hidden', 'true');
  return marker;
}

function getViewport(map) {
  const center = map.getCenter();
  const bounds = map.getBounds();
  const northEast = bounds?.getNorthEast();
  const southWest = bounds?.getSouthWest();

  return {
    center: center ? { lat: center.lat(), lng: center.lng() } : null,
    bounds:
      northEast && southWest
        ? {
            north: northEast.lat(),
            east: northEast.lng(),
            south: southWest.lat(),
            west: southWest.lng(),
          }
        : null,
  };
}

export default function MapPanel({ places, selectedPlace, userPosition, center, onSelectPlace, onSelectGooglePlace, onViewportChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerClassRef = useRef(null);
  const placeMarkersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const suppressMapClickUntilRef = useRef(0);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onSelectGooglePlaceRef = useRef(onSelectGooglePlace);
  const onViewportChangeRef = useRef(onViewportChange);
  const initialView = getInitialMapView({ center, userPosition, places });
  const latestCenterRef = useRef(initialView.center);
  const latestZoomRef = useRef(initialView.zoom);
  const hasCenteredOnUserRef = useRef(hasValidCoordinates(userPosition));
  const hasCenteredOnPlacesRef = useRef(Boolean(getPlacesCenter(places)));
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
  }, [onSelectPlace]);

  useEffect(() => {
    onSelectGooglePlaceRef.current = onSelectGooglePlace;
  }, [onSelectGooglePlace]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    const view = getInitialMapView({ center, userPosition, places });
    latestCenterRef.current = view.center;
    latestZoomRef.current = view.zoom;
  }, [center, places, userPosition]);

  useEffect(() => {
    let cancelled = false;
    let idleListener;
    let placeClickListener;

    async function initializeMap() {
      try {
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          importGoogleLibrary('maps'),
          importGoogleLibrary('marker'),
        ]);
        if (cancelled || !containerRef.current) return;

        markerClassRef.current = AdvancedMarkerElement;
        mapRef.current = new Map(containerRef.current, {
          center: latestCenterRef.current,
          zoom: latestZoomRef.current,
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID',
          disableDefaultUI: true,
          clickableIcons: true,
          gestureHandling: 'greedy',
          backgroundColor: '#eef1ea',
        });
        idleListener = mapRef.current.addListener('idle', () => onViewportChangeRef.current?.(getViewport(mapRef.current)));
        placeClickListener = mapRef.current.addListener('click', (event) => {
          if (Date.now() < suppressMapClickUntilRef.current) return;
          if (event.placeId) event.stop();
          const lat = event.latLng?.lat();
          const lng = event.latLng?.lng();
          if (!event.placeId && (!Number.isFinite(lat) || !Number.isFinite(lng))) return;
          recordBreadcrumb('map.google-place.click-received', { hasPlaceId: Boolean(event.placeId) });
          onSelectGooglePlaceRef.current?.({
            placeId: event.placeId,
            lat,
            lng,
          });
        });
        setMapReady(true);
      } catch (error) {
        if (!cancelled) {
          captureDiagnostic('map.initialize', error);
          setMapError(error.message);
        }
      }
    }

    initializeMap();
    return () => {
      cancelled = true;
      idleListener?.remove();
      placeClickListener?.remove();
      if (userMarkerRef.current) userMarkerRef.current.map = null;
      userMarkerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !hasValidCoordinates(center)) return;
    mapRef.current.panTo({ lat: Number(center.lat), lng: Number(center.lng) });
    if ((mapRef.current.getZoom() || 0) < 13) mapRef.current.setZoom(14);
  }, [center, mapReady]);

  useEffect(() => {
    if (center || !mapReady || !mapRef.current || hasCenteredOnUserRef.current || !hasValidCoordinates(userPosition)) return;
    hasCenteredOnUserRef.current = true;
    mapRef.current.panTo(numericPosition(userPosition));
    mapRef.current.setZoom(14);
  }, [center, mapReady, userPosition]);

  useEffect(() => {
    if (center || hasValidCoordinates(userPosition) || !mapReady || !mapRef.current || hasCenteredOnPlacesRef.current) return;
    const placesCenter = getPlacesCenter(places);
    if (!placesCenter) return;
    hasCenteredOnPlacesRef.current = true;
    mapRef.current.panTo(placesCenter);
    mapRef.current.setZoom(12);
  }, [center, mapReady, places, userPosition]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerClassRef.current) return undefined;

    placeMarkersRef.current.forEach((marker) => {
      marker.map = null;
    });
    placeMarkersRef.current = [];

    places.filter(hasValidCoordinates).forEach((place) => {
      const selected = selectedPlace?.id === place.id;
      const suppressMapClick = () => {
        suppressMapClickUntilRef.current = Date.now() + 400;
      };
      const marker = new markerClassRef.current({
        map: mapRef.current,
        position: { lat: Number(place.lat), lng: Number(place.lng) },
        title: place.name,
        content: createMarkerContent({ color: getPlaceColor(place), selected }),
        zIndex: selected ? 30 : 10,
        gmpClickable: true,
      });
      marker.addEventListener('gmp-click', (event) => {
        suppressMapClick();
        event.stopPropagation();
        recordBreadcrumb('map.saved-place.click-received');
        onSelectPlaceRef.current?.(place);
      });
      placeMarkersRef.current.push(marker);
    });

    return () => {
      placeMarkersRef.current.forEach((marker) => {
        marker.map = null;
      });
      placeMarkersRef.current = [];
    };
  }, [mapReady, places, selectedPlace]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerClassRef.current) return undefined;

    if (!hasValidCoordinates(userPosition)) {
      if (userMarkerRef.current) userMarkerRef.current.map = null;
      userMarkerRef.current = null;
      return undefined;
    }

    const position = { lat: Number(userPosition.lat), lng: Number(userPosition.lng) };
    if (!userMarkerRef.current) {
      userMarkerRef.current = new markerClassRef.current({
        map: mapRef.current,
        position,
        title: 'Tu ubicación',
        content: createMarkerContent({ color: '#1976ff', current: true }),
        zIndex: 20,
      });
    } else {
      userMarkerRef.current.position = position;
      if (userMarkerRef.current.map !== mapRef.current) userMarkerRef.current.map = mapRef.current;
    }
    return undefined;
  }, [mapReady, userPosition]);

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative', bgcolor: '#eef1ea' }}>
      <Box ref={containerRef} className="rumbo-google-map" />
      {!mapReady && !mapError && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {mapError && (
        <Alert severity="warning" sx={{ position: 'absolute', left: 16, right: 16, top: '45%', zIndex: 2 }}>
          {mapError}
        </Alert>
      )}
    </Box>
  );
}
