import { useEffect, useRef, useState } from 'react';
import { defaultCenter } from '../data/demoData';

const manualPositionKey = 'rumbo.manualPosition';
const lastPositionKey = 'rumbo.lastPosition';

function getStoredPosition(key) {
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function useUserLocation() {
  const initialManualPosition = getStoredPosition(manualPositionKey);
  const manualPositionRef = useRef(initialManualPosition);
  const initialPosition = initialManualPosition || getStoredPosition(lastPositionKey) || defaultCenter;
  const currentPositionRef = useRef(initialPosition);
  const livePositionVersionRef = useRef(0);
  const [position, setPosition] = useState(initialPosition);
  const [status, setStatus] = useState(initialManualPosition ? 'manual' : 'idle');
  const [error, setError] = useState('');

  function applyLivePosition(result) {
    const nextPosition = {
      lat: result.coords.latitude,
      lng: result.coords.longitude,
      label: 'Tu ubicación',
    };
    const previousPosition = currentPositionRef.current;
    const movedEnough =
      previousPosition?.manual ||
      Math.abs(Number(previousPosition?.lat) - nextPosition.lat) > 0.00005 ||
      Math.abs(Number(previousPosition?.lng) - nextPosition.lng) > 0.00005;

    localStorage.setItem(lastPositionKey, JSON.stringify(nextPosition));
    livePositionVersionRef.current += 1;
    if (movedEnough) {
      currentPositionRef.current = nextPosition;
      setPosition(nextPosition);
    }
    setStatus('ready');
    setError('');
    return nextPosition;
  }

  function handleLocationError(locationError) {
    setStatus(manualPositionRef.current ? 'manual' : 'fallback');
    setError(
      manualPositionRef.current
        ? 'Usando una ubicación de referencia manual.'
        : locationError.code === 1
          ? 'Permite la ubicación en Safari para ordenar lugares cerca de ti.'
          : 'No pude obtener tu ubicación. Puedes buscar una zona y usarla como referencia.',
    );
  }

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

    if (!manualPositionRef.current) setStatus('locating');
    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        if (!manualPositionRef.current) applyLivePosition(result);
      },
      handleLocationError,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
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
    manualPositionRef.current = manualPosition;
    currentPositionRef.current = manualPosition;
    setPosition(manualPosition);
    setStatus('manual');
    setError('Usando una ubicación de referencia manual.');
  }

  function requestLivePosition() {
    if (!window.isSecureContext || !navigator.geolocation) {
      const hasManualPosition = Boolean(manualPositionRef.current);
      setStatus(hasManualPosition ? 'manual' : 'fallback');
      setError(
        hasManualPosition
          ? 'La ubicación real no está disponible. Mantengo la referencia manual.'
          : 'La ubicación real necesita Safari en HTTPS y permiso de localización.',
      );
      return Promise.resolve(null);
    }

    const previousManualPosition = manualPositionRef.current;
    const livePositionVersion = livePositionVersionRef.current;
    manualPositionRef.current = null;
    localStorage.removeItem(manualPositionKey);
    setStatus('locating');
    setError('');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (result) => resolve(applyLivePosition(result)),
        (locationError) => {
          if (livePositionVersionRef.current > livePositionVersion) {
            resolve(currentPositionRef.current);
            return;
          }
          if (previousManualPosition) {
            manualPositionRef.current = previousManualPosition;
            localStorage.setItem(manualPositionKey, JSON.stringify(previousManualPosition));
            currentPositionRef.current = previousManualPosition;
            setPosition(previousManualPosition);
            setStatus('manual');
            setError('No pude actualizar tu ubicación. Mantengo la referencia manual.');
          } else {
            handleLocationError(locationError);
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
    });
  }

  return { position, status, error, setManualPosition, requestLivePosition };
}
