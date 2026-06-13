import { useEffect, useState } from 'react';
import { defaultCenter } from '../data/demoData';

const manualPositionKey = 'rumbo.manualPosition';

function getStoredManualPosition() {
  const stored = localStorage.getItem(manualPositionKey);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function useUserLocation() {
  const [position, setPosition] = useState(getStoredManualPosition() || defaultCenter);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!window.isSecureContext) {
      setStatus('insecure');
      setError('Para usar tu ubicación real en iPhone, abre Rumbo desde HTTPS. Mientras tanto puedes buscar una zona y usarla como referencia.');
      return undefined;
    }

    if (!navigator.geolocation) {
      setStatus('fallback');
      setError('Tu navegador no permite geolocalización.');
      return undefined;
    }

    setStatus('locating');
    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        setPosition({
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          label: 'Tu ubicación',
        });
        setStatus('ready');
      },
      (locationError) => {
        setStatus('fallback');
        setError(
          locationError.code === 1
            ? 'Permite la ubicación en Safari para ordenar lugares cerca de ti.'
            : 'No pude obtener tu ubicación. Puedes buscar una zona y usarla como referencia.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  function setManualPosition(nextPosition) {
    const manualPosition = {
      lat: nextPosition.lat,
      lng: nextPosition.lng,
      label: nextPosition.label || nextPosition.name || 'Referencia manual',
      manual: true,
    };

    localStorage.setItem(manualPositionKey, JSON.stringify(manualPosition));
    setPosition(manualPosition);
    if (status !== 'ready') {
      setStatus('manual');
      setError('Usando una ubicación de referencia manual.');
    }
  }

  return { position, status, error, setManualPosition };
}
