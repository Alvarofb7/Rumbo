import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Fab,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CloseIcon from '@mui/icons-material/Close';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import TuneIcon from '@mui/icons-material/Tune';
import { useTheme } from '@mui/material/styles';
import { demoInbox, demoPlaces } from '../data/demoData';
import { useAuth } from '../context/AuthContext';
import { useUserCollection } from '../hooks/useFirestoreCollection';
import { usePlaceFilters } from '../hooks/usePlaceFilters';
import { useUserLocation } from '../hooks/useUserLocation';
import {
  createPlaceSearchSession,
  resolveGooglePlaceAt,
  resolveGooglePlaceId,
  resolveLocationSuggestion,
  searchLocation,
} from '../lib/googlePlaces';
import { findNearestPlace } from '../lib/geo';
import { captureDiagnostic, recordBreadcrumb } from '../lib/diagnostics';
import { importPlaceFromUrl } from '../lib/placeImporter';
import { findDuplicatePlace } from '../lib/placeDuplicates';
import { getPlaceRecordMigration, sanitizePlaceRecord } from '../lib/placeData';
import { buildDirectionsUrl } from '../lib/mapDirections';
import FilterDrawer from './filters/FilterDrawer';
import InboxPanel from './panels/InboxPanel';
import LinkImportDialog from './dialogs/LinkImportDialog';
import MapPanel from './map/MapPanel';
import MapSearch from './map/MapSearch';
import PlaceDialog from './dialogs/PlaceDialog';
import PlacesPanel from './panels/PlacesPanel';
import GooglePlaceCard from './cards/GooglePlaceCard';
import SelectedPlaceCard from './cards/SelectedPlaceCard';
import AppMenuDrawer from './navigation/AppMenuDrawer';
import AppToast, { createToast } from './feedback/AppToast';
import { LocationConsentDialog } from './privacy/LocationPrivacy';

const emptyPlace = {
  name: '',
  address: '',
  zone: '',
  lat: '',
  lng: '',
  category: 'other',
  tags: [],
  rating: 0,
  status: 'wishlist',
  sourceType: 'manual',
  sourceUrl: '',
  resolvedUrl: '',
  providerPlaceId: '',
  providerType: '',
};

const initialFilters = {
  tags: [],
  status: 'all',
  minRating: 0,
  zone: 'all',
  sort: 'nearest',
};

function hasValidCoordinate(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function hasValidCoordinates(place) {
  return hasValidCoordinate(place?.lat) && hasValidCoordinate(place?.lng);
}

function activeFilterCount(filters) {
  return [
    filters.tags.length,
    filters.status !== 'all',
    filters.minRating > 0,
    filters.zone !== 'all',
  ].filter(Boolean).length;
}

function DataDrawer({ open, title, subtitle, isDesktop, onClose, children, fitContent = true }) {
  return (
    <Drawer
      anchor={isDesktop ? 'right' : 'bottom'}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', md: 430 },
          maxWidth: '100vw',
          height: { xs: fitContent ? 'auto' : '82dvh', md: '100dvh' },
          maxHeight: { xs: '82dvh', md: '100dvh' },
          borderRadius: { xs: '20px 20px 0 0', md: '18px 0 0 18px' },
          overflow: 'hidden',
          display: 'grid',
          gridTemplateRows: { xs: fitContent ? 'auto minmax(0, auto)' : 'auto minmax(0, 1fr)', md: 'auto minmax(0, 1fr)' },
          bgcolor: 'rgba(255,255,255,0.98)',
          border: '1px solid rgba(8,75,67,0.10)',
          boxShadow: { xs: '0 -24px 60px rgba(6,42,48,0.22)', md: '-22px 0 56px rgba(6,42,48,0.14)' },
        },
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1.2 }}>
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h3" noWrap>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {subtitle}
              </Typography>
            )}
          </Box>
          <IconButton aria-label={`Cerrar ${title}`} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ minHeight: 0, maxHeight: { xs: 'calc(82dvh - 76px)', md: 'none' }, overflow: 'auto', py: 1.4, pb: `calc(18px + env(safe-area-inset-bottom))` }}>
        {children}
      </Box>
    </Drawer>
  );
}

export default function MainApp() {
  const auth = useAuth();
  const { user } = auth;
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const {
    position,
    status: locationStatus,
    error: locationError,
    consent: locationConsent,
    setManualPosition,
    requestLivePosition,
    enableLocation,
    disableLocation,
  } = useUserLocation();
  const placesStore = useUserCollection(user, 'places', demoPlaces, {
    normalizeItem: sanitizePlaceRecord,
    getMigration: getPlaceRecordMigration,
  });
  const inboxStore = useUserCollection(user, 'inbox', demoInbox, {
    normalizeItem: sanitizePlaceRecord,
    getMigration: getPlaceRecordMigration,
  });
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [mapViewport, setMapViewport] = useState(null);
  const [mapFilters, setMapFilters] = useState(initialFilters);
  const [listSort, setListSort] = useState('nearest');
  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [googlePlacePreview, setGooglePlacePreview] = useState(null);
  const [googlePlaceLoading, setGooglePlaceLoading] = useState(false);
  const [deletedPlace, setDeletedPlace] = useState(null);
  const [toast, setToast] = useState(null);
  const [locationConsentOpen, setLocationConsentOpen] = useState(false);
  const googlePlaceRequestRef = useRef(0);

  const places = placesStore.items;
  const inbox = inboxStore.items;
  const listedFilters = useMemo(() => ({ ...initialFilters, sort: listSort }), [listSort]);
  const filteredMapPlaces = usePlaceFilters(places, mapFilters, null);
  const listedPlaces = usePlaceFilters(places, listedFilters, position);
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) || null;
  const visibleMapPlaces = useMemo(() => {
    if (!selectedPlace || !hasValidCoordinates(selectedPlace)) return filteredMapPlaces;
    if (filteredMapPlaces.some((place) => place.id === selectedPlace.id)) return filteredMapPlaces;
    return [...filteredMapPlaces, selectedPlace];
  }, [filteredMapPlaces, selectedPlace]);
  const filtersActive = activeFilterCount(mapFilters);
  const mapSearchBias = useMemo(
    () => ({
      center: mapViewport?.center || mapCenter || position,
      bounds: mapViewport?.bounds || null,
    }),
    [mapCenter, mapViewport, position],
  );

  const stats = useMemo(() => {
    return {
      saved: places.length,
      pending: places.filter((place) => place.status === 'wishlist').length,
      review: inbox.length,
      visited: places.filter((place) => place.status === 'visited').length,
      favorites: places.filter((place) => place.status === 'favorite').length,
    };
  }, [inbox.length, places]);
  const syncState = useMemo(() => {
    const states = [placesStore.syncState, inboxStore.syncState];
    return (
      states.find((state) => state.status === 'reconnecting') ||
      states.find((state) => state.status === 'error') ||
      states.find((state) => state.status === 'offline') ||
      states.find((state) => state.status === 'pending') ||
      states.find((state) => state.status === 'synced') ||
      states[0]
    );
  }, [inboxStore.syncState, placesStore.syncState]);
  const syncMeta = {
    synced: { label: 'Sincronizado', color: 'success.main' },
    pending: { label: 'Guardando cambios', color: 'warning.main' },
    reconnecting: { label: 'Reconectando la sincronización', color: 'warning.main' },
    offline: { label: 'Sin conexión; cambios en cola', color: 'warning.main' },
    error: { label: 'Error de sincronización', color: 'error.main' },
    local: { label: 'Modo local', color: 'warning.main' },
  }[syncState.status];

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
      setDeletedPlace(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  function showToast(message, severity = 'success', options = {}) {
    setToast(createToast(message, severity, options));
  }

  function openCreatePlace(prefill = null) {
    googlePlaceRequestRef.current += 1;
    setGooglePlacePreview(null);
    setGooglePlaceLoading(false);
    setEditingPlace(prefill || { ...emptyPlace });
    setPlaceDialogOpen(true);
  }

  function openEditPlace(place) {
    setEditingPlace(place);
    setPlaceDialogOpen(true);
  }

  function openPlaces() {
    setReviewOpen(false);
    setPlacesOpen(true);
  }

  function openReview() {
    setPlacesOpen(false);
    setReviewOpen(true);
  }

  function openFilters() {
    setFiltersOpen(true);
  }

  async function resolvePlaceLocation(place) {
    const queries = [
      [place.name, place.address, place.zone].filter(Boolean).join(', '),
      [place.address, place.zone].filter(Boolean).join(', '),
      [place.name, place.zone].filter(Boolean).join(', '),
      place.address,
      place.name,
    ]
      .map((query) => query?.trim())
      .filter(Boolean);

    for (const query of [...new Set(queries)]) {
      try {
        const session = createPlaceSearchSession();
        const [result] = await searchLocation(query, {
          ...mapSearchBias,
          session,
          allowTextSearch: true,
        });
        if (result) return resolveLocationSuggestion(result, session);
      } catch {
        // Try the next query before falling back to the user position.
      }
    }

    return null;
  }

  async function buildPlacePayload(place, options = {}) {
    const placeRecord = { ...place };
    delete placeRecord.inboxId;
    const allowCurrentFallback = options.allowCurrentFallback ?? (!place.address?.trim() && !place.sourceUrl);
    let coordinates = hasValidCoordinates(placeRecord)
      ? {
          lat: Number(placeRecord.lat),
          lng: Number(placeRecord.lng),
        }
      : { lat: Number.NaN, lng: Number.NaN };
    let approximate = false;
    let locationResult = null;

    if (!hasValidCoordinates(coordinates)) {
      locationResult = await resolvePlaceLocation(place);
      if (locationResult) {
        coordinates = { lat: locationResult.lat, lng: locationResult.lng };
      }
    }

    if (!hasValidCoordinates(coordinates) && allowCurrentFallback) {
      coordinates = { lat: position.lat, lng: position.lng };
      approximate = true;
    }

    if (!hasValidCoordinates(coordinates)) {
      throw new Error('No he podido ubicar este lugar. Elige un resultado en el buscador antes de guardarlo.');
    }

    return {
      payload: sanitizePlaceRecord({
        ...placeRecord,
        address: placeRecord.address || locationResult?.address || '',
        zone: placeRecord.zone || locationResult?.zone || '',
        lat: coordinates.lat,
        lng: coordinates.lng,
        category: placeRecord.category && placeRecord.category !== 'other' ? placeRecord.category : locationResult?.category || placeRecord.category || 'other',
        providerType: placeRecord.providerType || locationResult?.providerType || '',
        rating: Number(placeRecord.rating || 0),
        tags: placeRecord.tags || [],
      }),
      approximate,
    };
  }

  function openDuplicatePlace(place, message) {
    googlePlaceRequestRef.current += 1;
    setGooglePlacePreview(null);
    setGooglePlaceLoading(false);
    setSelectedPlaceId(place.id);
    if (hasValidCoordinates(place)) setMapCenter({ lat: Number(place.lat), lng: Number(place.lng) });
    setPlaceDialogOpen(false);
    setPlacesOpen(false);
    setReviewOpen(false);
    showToast(message, 'info');
  }

  async function handleSavePlace(place) {
    let result;
    const mode = place.id ? 'edit' : 'create';
    recordBreadcrumb('place.save.started', { mode });

    try {
      result = await buildPlacePayload(place);
    } catch (error) {
      captureDiagnostic('place.save.location', error, { mode });
      showToast(error.message, 'error');
      return false;
    }

    const { payload, approximate } = result;
    const duplicate = findDuplicatePlace(payload, places, { excludeId: payload.id });

    if (duplicate) {
      recordBreadcrumb('place.save.duplicate', { mode });
      if (payload.id) {
        setSelectedPlaceId(duplicate.id);
        if (hasValidCoordinates(duplicate)) setMapCenter({ lat: Number(duplicate.lat), lng: Number(duplicate.lng) });
        showToast(`Ya existe un lugar parecido: ${duplicate.name}.`, 'warning');
        return false;
      }

      openDuplicatePlace(duplicate, `Ya tenías guardado ${duplicate.name}. Te lo abro.`);
      return true;
    }

    try {
      if (payload.id) {
        const updated = await placesStore.updateItem(payload.id, payload);
        setSelectedPlaceId(payload.id);
        showToast(updated?.queued ? 'Cambio en cola hasta recuperar la conexión.' : `Lugar actualizado${approximate ? ' con ubicación aproximada' : ''}.`, updated?.queued || approximate ? 'info' : 'success');
      } else {
        const created = await placesStore.addItem(payload);
        setSelectedPlaceId(created.id);
        showToast(created.queued ? 'Cambio en cola hasta recuperar la conexión.' : `Lugar guardado${approximate ? ' con ubicación aproximada' : ''}.`, created.queued || approximate ? 'info' : 'success');
      }
    } catch (error) {
      captureDiagnostic('place.save.persist', error, { mode });
      showToast(error.message || 'No se ha podido guardar el lugar.', 'error');
      return false;
    }

    setMapCenter({ lat: payload.lat, lng: payload.lng });
    setPlaceDialogOpen(false);
    setPlacesOpen(false);
    setReviewOpen(false);
    recordBreadcrumb('place.save.completed', { mode });
    return true;
  }

  async function handleDeletePlace(placeId) {
    const place = places.find((candidate) => candidate.id === placeId);
    if (!place) return;
    recordBreadcrumb('place.delete.started');
    let deletion;
    try { deletion = await placesStore.deleteItem(placeId); } catch (error) { showToast(error.message || 'No se ha podido eliminar el lugar.', 'error'); return; }
    if (selectedPlaceId === placeId) setSelectedPlaceId(null);
    if (deletion?.queued) {
      showToast('Eliminación en cola hasta recuperar la conexión.', 'info');
      return;
    }
    setDeletedPlace(place);
    showToast('Lugar eliminado.', 'success', { undoDelete: true });
    recordBreadcrumb('place.delete.queued');
  }

  async function undoDeletePlace() {
    if (!deletedPlace) return;
    let restored;
    try { restored = await placesStore.addItem(deletedPlace); } catch (error) { showToast(error.message || 'No se ha podido recuperar el lugar.', 'error'); return; }
    if (restored.queued) {
      showToast('Recuperación en cola hasta recuperar la conexión.', 'info');
      restored.completion?.then(({ error }) => {
        if (error) {
          showToast(error.message || 'No se ha podido recuperar el lugar.', 'error', { undoDelete: true });
          return;
        }
        setDeletedPlace((pending) => (pending?.id === deletedPlace.id ? null : pending));
        setSelectedPlaceId(restored.id);
        showToast('Lugar recuperado.');
      });
      return;
    }
    setDeletedPlace(null);
    setSelectedPlaceId(restored.id);
    showToast('Lugar recuperado.');
  }

  async function handleQuickSaveGooglePlace(place) {
    const saved = await handleSavePlace({
      ...emptyPlace,
      ...place,
      id: '',
      status: 'wishlist',
      sourceType: 'google',
    });
    if (saved) closeGooglePlacePreview();
  }

  async function handleImportLink(url) {
    recordBreadcrumb('link.import.started');
    const candidate = await importPlaceFromUrl(url, auth);
    const duplicatePlace = findDuplicatePlace(candidate, places);
    if (duplicatePlace) {
      recordBreadcrumb('link.import.duplicate', { target: 'places' });
      setLinkDialogOpen(false);
      openDuplicatePlace(duplicatePlace, `Ya tenías guardado ${duplicatePlace.name}. Te lo abro.`);
      return;
    }

    const duplicateInboxItem = findDuplicatePlace(candidate, inbox);
    if (duplicateInboxItem) {
      recordBreadcrumb('link.import.duplicate', { target: 'inbox' });
      setLinkDialogOpen(false);
      openReview();
      showToast(`Ese enlace ya está en revisión: ${duplicateInboxItem.title || duplicateInboxItem.name}.`, 'warning');
      return;
    }

    await inboxStore.addItem(candidate);
    setLinkDialogOpen(false);
    openReview();
    showToast('Enlace analizado. Revísalo antes de guardarlo.', 'info');
    recordBreadcrumb('link.import.completed', { sourceType: candidate.sourceType || 'unknown' });
  }

  async function handleSaveInboxItem(item) {
    const place = {
      name: item.title,
      address: item.address,
      zone: item.zone,
      lat: item.lat || '',
      lng: item.lng || '',
      category: item.category || 'other',
      tags: item.tags || [],
      rating: item.rating || 0,
      status: 'wishlist',
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      resolvedUrl: item.resolvedUrl || '',
      providerType: item.providerType || '',
    };
    let result;

    try {
      result = await buildPlacePayload(place, { allowCurrentFallback: false });
    } catch (error) {
      captureDiagnostic('inbox.save.location', error);
      showToast(error.message, 'error');
      return;
    }

    const { payload, approximate } = result;
    const duplicate = findDuplicatePlace(payload, places);
    if (duplicate) {
      recordBreadcrumb('inbox.save.duplicate');
      openDuplicatePlace(duplicate, `Ya tenías guardado ${duplicate.name}. La recomendación sigue en revisión.`);
      return;
    }

    let created;
    try {
      created = await inboxStore.convertInboxToPlace(item.id, payload, placesStore);
    } catch (error) {
      captureDiagnostic('inbox.save.persist', error);
      showToast(error.message || 'No se ha podido guardar la recomendación.', 'error');
      return;
    }
    if (created.queued) {
      showToast('Conversión en cola hasta recuperar la conexión.', 'info');
      return;
    }
    setSelectedPlaceId(created.id);
    setMapCenter({ lat: payload.lat, lng: payload.lng });
    setReviewOpen(false);
    showToast(`Recomendación guardada${approximate ? ' con ubicación aproximada' : ''}.`, approximate ? 'info' : 'success');
  }

  async function handleEditInboxItem(item) {
    openCreatePlace({
      ...emptyPlace,
      name: item.title,
      address: item.address,
      zone: item.zone,
      lat: item.lat || '',
      lng: item.lng || '',
      category: item.category || 'other',
      tags: item.tags || [],
      rating: item.rating || 0,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      resolvedUrl: item.resolvedUrl || '',
      providerType: item.providerType || '',
      inboxId: item.id,
    });
  }

  async function handleSaveEditedInboxItem(place) {
    let result;

    try {
      result = await buildPlacePayload(place, { allowCurrentFallback: false });
    } catch (error) {
      captureDiagnostic('inbox.edit.location', error);
      showToast(error.message, 'error');
      return false;
    }

    const { payload, approximate } = result;
    const duplicate = findDuplicatePlace(payload, places);
    if (duplicate) {
      openDuplicatePlace(duplicate, `Ya tenías guardado ${duplicate.name}. La recomendación sigue en revisión.`);
      return false;
    }

    try {
      const created = await inboxStore.convertInboxToPlace(place.inboxId, payload, placesStore);
      if (created.queued) {
        showToast('Conversión en cola hasta recuperar la conexión.', 'info');
        return true;
      }
      setSelectedPlaceId(created.id);
      setMapCenter({ lat: payload.lat, lng: payload.lng });
      setPlaceDialogOpen(false);
      setReviewOpen(false);
      showToast(`Recomendación guardada${approximate ? ' con ubicación aproximada' : ''}.`, approximate ? 'info' : 'success');
      return true;
    } catch (error) {
      captureDiagnostic('inbox.edit.persist', error);
      showToast(error.message || 'No se ha podido guardar la recomendación.', 'error');
      return false;
    }
  }

  async function handleDiscardInboxItem(itemId) {
    try { await inboxStore.deleteItem(itemId); } catch (error) { showToast(error.message || 'No se ha podido descartar la recomendación.', 'error'); return; }
    showToast('Recomendación descartada.');
  }

  async function handleSearchSelect(result) {
    googlePlaceRequestRef.current += 1;
    setGooglePlacePreview(null);
    setGooglePlaceLoading(false);
    setSelectedPlaceId(null);
    setMapCenter({ lat: result.lat, lng: result.lng });
    if (locationStatus !== 'ready') {
      setManualPosition({ lat: result.lat, lng: result.lng, label: result.name });
      showToast(`${result.name} será tu referencia de cercanía.`, 'info');
    }
    setPlacesOpen(false);
    setReviewOpen(false);
  }

  function selectPlace(place) {
    if (!hasValidCoordinates(place)) return;
    recordBreadcrumb('place.selected');
    googlePlaceRequestRef.current += 1;
    setGooglePlacePreview(null);
    setGooglePlaceLoading(false);
    setSelectedPlaceId(place.id);
    setMapCenter({ lat: Number(place.lat), lng: Number(place.lng) });
    if (!isDesktop) setPlacesOpen(false);
  }

  async function centerOnUser() {
    if (locationConsent !== true) {
      setLocationConsentOpen(true);
      return;
    }
    recordBreadcrumb('location.button.tapped');
    googlePlaceRequestRef.current += 1;
    setGooglePlacePreview(null);
    setGooglePlaceLoading(false);
    setSelectedPlaceId(null);
    const livePosition = await requestLivePosition();
    const nextPosition = livePosition || position;
    setMapCenter({ lat: nextPosition.lat, lng: nextPosition.lng });
    recordBreadcrumb('location.button.completed', { live: Boolean(livePosition) });
  }

  async function activateLocation() {
    const locationResult = await enableLocation();
    if (!locationResult.enabled) return;
    recordBreadcrumb('location.consent.enabled');
    setLocationConsentOpen(false);
    if (locationResult.position) {
      setMapCenter({ lat: locationResult.position.lat, lng: locationResult.position.lng });
    }
  }

  async function retrySync() {
    await Promise.all([placesStore.retrySync(), inboxStore.retrySync()]);
  }

  function closeGooglePlacePreview() {
    googlePlaceRequestRef.current += 1;
    setGooglePlacePreview(null);
    setGooglePlaceLoading(false);
  }

  async function selectGooglePlace({ placeId, lat, lng }) {
    recordBreadcrumb('map.google-place.tapped', { hasPlaceId: Boolean(placeId) });
    const exactSavedPlace = placeId ? places.find((place) => place.providerPlaceId === placeId) : null;
    const nearbySavedPlace = findNearestPlace({ lat, lng }, places, 90);
    const savedPlace = exactSavedPlace || nearbySavedPlace;
    if (savedPlace) {
      selectPlace(savedPlace);
      return;
    }

    const requestId = ++googlePlaceRequestRef.current;
    setSelectedPlaceId(null);
    setGooglePlacePreview(null);
    setGooglePlaceLoading(true);

    try {
      const place = placeId ? await resolveGooglePlaceId(placeId) : await resolveGooglePlaceAt({ lat, lng });
      if (requestId !== googlePlaceRequestRef.current) return;
      if (!place) return;

      const matchingSavedPlace = places.find((savedPlace) => savedPlace.providerPlaceId === place.providerPlaceId);
      if (matchingSavedPlace) {
        selectPlace(matchingSavedPlace);
        return;
      }

      setGooglePlacePreview({
        ...emptyPlace,
        ...place,
        id: '',
        sourceType: 'google',
        sourceUrl: place.sourceUrl || '',
      });
      recordBreadcrumb('map.google-place.previewed', { hasPlaceId: Boolean(place.providerPlaceId) });
    } catch (error) {
      if (requestId === googlePlaceRequestRef.current) {
        captureDiagnostic('map.google-place.resolve', error, { hasPlaceId: Boolean(placeId) });
        showToast(error.message, 'error');
      }
    } finally {
      if (requestId === googlePlaceRequestRef.current) setGooglePlaceLoading(false);
    }
  }

  function openDirections(place) {
    if (!hasValidCoordinates(place)) return;

    const { provider, url } = buildDirectionsUrl(place);
    if (!url) return;
    recordBreadcrumb('directions.opened', { provider });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Box sx={{ height: '100dvh', bgcolor: 'background.default', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <MapPanel
          places={visibleMapPlaces}
          selectedPlace={selectedPlace}
          userPosition={position}
          center={mapCenter}
          onSelectPlace={selectPlace}
          onSelectGooglePlace={selectGooglePlace}
          onViewportChange={setMapViewport}
        />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          top: 'calc(12px + env(safe-area-inset-top))',
          left: { xs: 12, md: 18 },
          right: { xs: 12, md: 18 },
          zIndex: 960,
          pointerEvents: 'none',
        }}
      >
        <MapSearch
          bias={mapSearchBias}
          onMenuOpen={() => setMenuOpen(true)}
          onSelect={handleSearchSelect}
          syncMeta={syncMeta}
        />
      </Box>

      {['offline', 'error'].includes(syncState.status) && (
        <Alert
          severity={syncState.status === 'error' ? 'error' : 'warning'}
          action={<Button color="inherit" size="small" onClick={() => void retrySync()}>Reconectar</Button>}
          sx={{
            position: 'absolute',
            top: 'calc(82px + env(safe-area-inset-top))',
            left: { xs: 12, md: 18 },
            right: { xs: 76, md: 'auto' },
            width: { md: 410 },
            zIndex: 945,
            borderRadius: '14px',
            boxShadow: '0 14px 36px rgba(6,42,48,0.14)',
          }}
        >
          {syncState.status === 'error'
            ? 'No se ha podido sincronizar. Comprueba la conexión y vuelve a conectar.'
            : 'Sin conexión. Vuelve a conectar para sincronizar los cambios pendientes.'}
        </Alert>
      )}

      <Stack
        sx={{
          position: 'absolute',
          right: { xs: 12, md: 18 },
          top: 'calc(88px + env(safe-area-inset-top))',
          gap: 1,
          zIndex: 950,
        }}
      >
        <Tooltip title={locationConsent === true ? 'Mi ubicación' : 'Activar ubicación'}>
          <IconButton
            aria-label={locationConsent === true ? 'Ir a mi ubicación' : 'Activar ubicación'}
            onClick={() => void centerOnUser()}
            sx={{ bgcolor: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 26px rgba(6,42,48,0.14)', backdropFilter: 'blur(18px)' }}
          >
            <MyLocationIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={filtersActive ? `Filtrar mapa, ${filtersActive} activos` : 'Filtrar mapa'}>
          <IconButton
            aria-label={filtersActive ? `Filtrar mapa, ${filtersActive} activos` : 'Filtrar mapa'}
            onClick={openFilters}
            sx={{ bgcolor: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 26px rgba(6,42,48,0.14)', backdropFilter: 'blur(18px)' }}
          >
            <Badge badgeContent={filtersActive || null} color="primary">
              <TuneIcon />
            </Badge>
          </IconButton>
        </Tooltip>
        <Tooltip title="Mis lugares">
          <IconButton
            aria-label="Abrir lista de lugares"
            onClick={openPlaces}
            sx={{ bgcolor: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 26px rgba(6,42,48,0.14)', backdropFilter: 'blur(18px)' }}
          >
            <BookmarkBorderIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {locationStatus !== 'ready' && locationError && !selectedPlace && !googlePlacePreview && !googlePlaceLoading && (
        <Paper
          elevation={0}
          sx={{
            position: 'absolute',
            left: { xs: 14, md: 18 },
            right: { xs: 76, md: 'auto' },
            bottom: 'calc(18px + env(safe-area-inset-bottom))',
            zIndex: 930,
            width: { md: 360 },
            px: 1.4,
            py: 1,
            borderRadius: '14px',
            bgcolor: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(8,75,67,0.10)',
            boxShadow: '0 14px 36px rgba(6,42,48,0.14)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <Typography variant="body2" color="text.secondary" noWrap>
            {locationError}
          </Typography>
        </Paper>
      )}

      <AppToast
        toast={toast}
        elevated={Boolean(selectedPlace || googlePlacePreview || googlePlaceLoading)}
        onClose={() => {
          if (toast?.undoDelete) setDeletedPlace(null);
          setToast(null);
        }}
        onUndo={() => void undoDeletePlace()}
      />

      <Fab
        color="secondary"
        aria-label="Crear lugar"
        onClick={() => openCreatePlace()}
        sx={{
          position: 'absolute',
          right: { xs: 16, md: 22 },
          bottom: 'calc(18px + env(safe-area-inset-bottom))',
          display: selectedPlace || googlePlacePreview || googlePlaceLoading ? 'none' : 'inline-flex',
          zIndex: 950,
          width: 60,
          height: 60,
          boxShadow: '0 16px 34px rgba(216,133,47,0.34)',
        }}
      >
        <AddIcon fontSize="large" />
      </Fab>

      <SelectedPlaceCard
        place={selectedPlace}
        onClose={() => setSelectedPlaceId(null)}
        onDirections={openDirections}
        onEdit={openEditPlace}
      />

      <GooglePlaceCard
        place={googlePlacePreview}
        loading={googlePlaceLoading}
        onClose={closeGooglePlacePreview}
        onSave={(place) => void handleQuickSaveGooglePlace(place)}
      />

      <DataDrawer
        open={placesOpen}
        title="Mis lugares"
        isDesktop={isDesktop}
        onClose={() => setPlacesOpen(false)}
      >
        <PlacesPanel
          places={listedPlaces}
          selectedPlace={selectedPlace}
          totalPlaces={places.length}
          sort={listSort}
          onSortChange={setListSort}
          onSelect={selectPlace}
          onEdit={openEditPlace}
          onDelete={handleDeletePlace}
          onDirections={openDirections}
        />
      </DataDrawer>

      <DataDrawer
        open={reviewOpen}
        title="Revisar enlaces"
        subtitle={inbox.length ? `${inbox.length} pendientes` : 'Sin recomendaciones pendientes'}
        isDesktop={isDesktop}
        onClose={() => setReviewOpen(false)}
      >
        <InboxPanel
          inbox={inbox}
          onAddLink={() => setLinkDialogOpen(true)}
          onSave={handleSaveInboxItem}
          onEdit={handleEditInboxItem}
          onDiscard={handleDiscardInboxItem}
        />
      </DataDrawer>

      <PlaceDialog
        open={placeDialogOpen}
        place={editingPlace}
        onClose={() => setPlaceDialogOpen(false)}
        searchBias={mapSearchBias}
        onSave={(place) => (place.inboxId ? handleSaveEditedInboxItem(place) : handleSavePlace(place))}
      />
      <LinkImportDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onImport={handleImportLink}
      />
      <FilterDrawer open={filtersOpen} filters={mapFilters} setFilters={setMapFilters} onClose={() => setFiltersOpen(false)} places={places} />
      <LocationConsentDialog
        open={locationConsentOpen}
        onClose={() => setLocationConsentOpen(false)}
        onEnable={() => void activateLocation()}
      />
      <Drawer
        anchor="left"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        PaperProps={{ sx: { borderRadius: '0 18px 18px 0' } }}
      >
        <AppMenuDrawer
          stats={stats}
          places={places}
          inbox={inbox}
          syncState={syncState}
          locationConsent={locationConsent}
          locationStatus={locationStatus}
          onClose={() => setMenuOpen(false)}
          onImportLink={() => setLinkDialogOpen(true)}
          onOpenReview={openReview}
          onRetrySync={() => void retrySync()}
          onEnableLocation={() => void activateLocation()}
          onDisableLocation={disableLocation}
        />
      </Drawer>
    </Box>
  );
}
