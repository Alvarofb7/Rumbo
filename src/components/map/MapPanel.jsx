import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { Box } from '@mui/material';
import { defaultCenter } from '../../data/demoData';
import { formatDistance } from '../../lib/geo';
import { getPlaceColor, getStatusMeta } from '../common/placeUtils';

const localNameTileLayer = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

function Recenter({ center }) {
  const map = useMap();

  useEffect(() => {
    if (!Number.isFinite(Number(center?.lat)) || !Number.isFinite(Number(center?.lng))) return;
    map.flyTo([center.lat, center.lng], map.getZoom() < 13 ? 14 : map.getZoom(), { duration: 0.25 });
  }, [center, map]);

  return null;
}

function hasValidCoordinate(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function hasValidCoordinates(place) {
  return hasValidCoordinate(place?.lat) && hasValidCoordinate(place?.lng);
}

export default function MapPanel({ places, selectedPlace, userPosition, center, onDirections, onSelectPlace }) {
  const safeCenter = center || userPosition || defaultCenter;
  const visiblePlaces = places.filter(hasValidCoordinates);

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer center={[safeCenter.lat, safeCenter.lng]} zoom={14} zoomControl={false} attributionControl={false}>
        <TileLayer
          attribution={localNameTileLayer.attribution}
          url={localNameTileLayer.url}
          className="rumbo-map-tiles"
        />
        <Recenter center={safeCenter} />
        {hasValidCoordinates(userPosition) && (
          <CircleMarker
            center={[userPosition.lat, userPosition.lng]}
            radius={11}
            pathOptions={{
              color: '#ffffff',
              weight: 4,
              fillColor: '#1976ff',
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top">Tu ubicación</Tooltip>
          </CircleMarker>
        )}

        {visiblePlaces.map((place) => {
          const selected = selectedPlace?.id === place.id;
          const color = getPlaceColor(place);
          const statusMeta = getStatusMeta(place.status);

          return (
            <CircleMarker
              key={place.id}
              center={[Number(place.lat), Number(place.lng)]}
              radius={selected ? 13 : 10}
              pathOptions={{
                color: '#ffffff',
                weight: selected ? 5 : 3,
                fillColor: color,
                fillOpacity: selected ? 1 : 0.92,
              }}
              eventHandlers={{ click: () => onSelectPlace(place) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {place.name}
              </Tooltip>
              <Popup minWidth={220}>
                <Box className="rumbo-map-popup">
                  <strong>{place.name}</strong>
                  <span>{place.address || place.zone || 'Sin dirección'}</span>
                  <div className="rumbo-map-popup-meta">
                    <span>{statusMeta.label}</span>
                    <span>{formatDistance(place.distance)}</span>
                  </div>
                  {place.notes && <p>{place.notes}</p>}
                  <button type="button" onClick={() => onDirections?.(place)}>
                    Cómo llegar
                  </button>
                </Box>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <Box className="rumbo-map-attribution">
        © OpenStreetMap
      </Box>
    </Box>
  );
}
