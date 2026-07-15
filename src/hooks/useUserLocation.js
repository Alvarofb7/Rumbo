import { useEffect, useRef, useState } from 'react';
import { defaultCenter } from '../data/demoData';
import { captureDiagnostic } from '../lib/diagnostics';
import { distanceInMeters } from '../lib/geo';
import { readStorageJson, removeStorageValue, writeStorageJson } from '../lib/storage';

export const locationConsentKey = 'rumbo.locationConsent';
const legacyLocationKeys = ['rumbo.lastPosition', 'rumbo.manualPosition'];
const minLivePositionMoveMeters = 18;

export function readLocationConsent() {
  return readStorageJson(locationConsentKey, null, { validate: (value) => value === true || value === false });
}

export function persistLocationConsent(value) {
  return writeStorageJson(locationConsentKey, value);
}

function hasMovedEnough(previousPosition, nextPosition) {
  if (previousPosition?.manual) return true;

  return (
    distanceInMeters(
      { lat: Number(previousPosition?.lat), lng: Number(previousPosition?.lng) },
      nextPosition,
    ) >= minLivePositionMoveMeters
  );
}

export function useUserLocation() {
  const initialConsent = readLocationConsent();
  const manualPositionRef = useRef(null);
  const initialPosition = defaultCenter;
  const currentPositionRef = useRef(initialPosition);
  const livePositionVersionRef = useRef(0);
  const consentRef = useRef(initialConsent);
  const [position, setPosition] = useState(initialPosition);
  const [consent, setConsent] = useState(initialConsent);
  const [status, setStatus] = useState(initialConsent === true ? 'locating' : 'idle');
  const [error, setError] = useState('');

  useEffect(() => {
    legacyLocationKeys.forEach(removeStorageValue);
  }, []);

  function applyLivePosition(result) {
    if (consentRef.current !== true) return currentPositionRef.current;
    const nextPosition = {
      lat: result.coords.latitude,
      lng: result.coords.longitude,
      label: 'Tu ubicación',
    };
    const previousPosition = currentPositionRef.current;
    const movedEnough = hasMovedEnough(previousPosition, nextPosition);

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
    if (consentRef.current !== true) return;
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
    if (consent !== true) return undefined;

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
  }, [consent]);

  function setManualPosition(nextPosition) {
    const manualPosition = {
      lat: nextPosition.lat,
      lng: nextPosition.lng,
      label: nextPosition.label || nextPosition.name || 'Referencia manual',
      manual: true,
    };

    manualPositionRef.current = manualPosition;
    currentPositionRef.current = manualPosition;
    setPosition(manualPosition);
    setStatus('manual');
    setError('Usando una ubicación de referencia manual.');
  }

  function requestLivePosition({ consentOverride = false } = {}) {
    if (!consentOverride && consentRef.current !== true) return Promise.resolve(null);
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
    setStatus('locating');
    setError('');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (result) => resolve(applyLivePosition(result)),
        (locationError) => {
          if (locationError.code !== 1) {
            captureDiagnostic('location.request', locationError, { code: locationError.code });
          }
          if (livePositionVersionRef.current > livePositionVersion) {
            resolve(currentPositionRef.current);
            return;
          }
          if (previousManualPosition) {
            manualPositionRef.current = previousManualPosition;
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

  function enableLocation() {
    if (!persistLocationConsent(true)) {
      setError('No pude guardar tu preferencia de ubicación. Inténtalo de nuevo.');
      return Promise.resolve(null);
    }
    consentRef.current = true;
    setConsent(true);
    return requestLivePosition({ consentOverride: true });
  }

  function disableLocation() {
    if (!persistLocationConsent(false)) {
      setError('No pude desactivar la ubicación de forma segura. Inténtalo de nuevo.');
      return false;
    }
    consentRef.current = false;
    manualPositionRef.current = null;
    currentPositionRef.current = defaultCenter;
    setConsent(false);
    setPosition(defaultCenter);
    setStatus('idle');
    setError('La ubicación está desactivada. Puedes activarla cuando quieras.');
    return true;
  }

  return { position, status, error, consent, setManualPosition, requestLivePosition, enableLocation, disableLocation };
}
