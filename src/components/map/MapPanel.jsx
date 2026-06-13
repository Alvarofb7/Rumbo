import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Box } from '@mui/material';
import { defaultCenter } from '../../data/demoData';
import { getPlaceColor } from '../common/placeUtils';

const appleLikeTileLayer = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

function Recenter({ center }) {
  const map = useMap();

  useEffect(() => {
    if (!center?.lat || !center?.lng) return;
    map.flyTo([center.lat, center.lng], map.getZoom() < 13 ? 14 : map.getZoom(), { duration: 0.6 });
  }, [center, map]);

  return null;
}

function MapEvents({ onCenterChange }) {
  useMapEvents({
    moveend(event) {
      const center = event.target.getCenter();
      onCenterChange?.({ lat: center.lat, lng: center.lng });
    },
  });

  return null;
}

export default function MapPanel({ places, selectedPlace, userPosition, center, onCenterChange, onSelectPlace }) {
  const safeCenter = center || userPosition || defaultCenter;

  return (
    <Box sx={{ width: '100%', height: '100%' }}>
      <MapContainer center={[safeCenter.lat, safeCenter.lng]} zoom={14} zoomControl={false} attributionControl>
        <TileLayer
          attribution={appleLikeTileLayer.attribution}
          url={appleLikeTileLayer.url}
        />
        <Recenter center={safeCenter} />
        <MapEvents onCenterChange={onCenterChange} />

        {userPosition?.lat && (
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

        {places.map((place) => {
          const selected = selectedPlace?.id === place.id;
          const color = getPlaceColor(place);

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
            </CircleMarker>
          );
        })}
      </MapContainer>
    </Box>
  );
}
