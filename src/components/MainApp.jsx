import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  ClickAwayListener,
  Divider,
  Drawer,
  Fab,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import MenuIcon from '@mui/icons-material/Menu';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import { useTheme } from '@mui/material/styles';
import { demoInbox, demoPlaces } from '../data/demoData';
import { useAuth } from '../context/AuthContext';
import { useUserCollection } from '../hooks/useFirestoreCollection';
import { usePlaceFilters } from '../hooks/usePlaceFilters';
import { useUserLocation } from '../hooks/useUserLocation';
import {
  createPlaceSearchSession,
  resetPlaceSearchSession,
  resolveGooglePlaceAt,
  resolveGooglePlaceId,
  resolveLocationSuggestion,
  searchLocation,
} from '../lib/googlePlaces';
import { findNearestPlace } from '../lib/geo';
import { captureDiagnostic, recordBreadcrumb } from '../lib/diagnostics';
import { importPlaceFromUrl } from '../lib/placeImporter';
import { getPlaceRecordMigration, sanitizePlaceRecord } from '../lib/placeData';
import FilterDrawer from './filters/FilterDrawer';
import InboxPanel from './panels/InboxPanel';
import LinkImportDialog from './dialogs/LinkImportDialog';
import MapPanel from './map/MapPanel';
import PlaceDialog from './dialogs/PlaceDialog';
import PlacesPanel from './panels/PlacesPanel';
import GooglePlaceCard from './cards/GooglePlaceCard';
import SelectedPlaceCard from './cards/SelectedPlaceCard';
import AppMenuDrawer from './navigation/AppMenuDrawer';

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
  search: '',
  tags: [],
  status: 'all',
  minRating: 0,
  zone: '',
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
    filters.search.trim(),
    filters.tags.length,
    filters.status !== 'all',
    filters.minRating > 0,
    filters.zone,
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
  const { user } = useAuth();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { position, status: locationStatus, error: locationError, setManualPosition, requestLivePosition } = useUserLocation();
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
  const [mapSearchOpen, setMapSearchOpen] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSearchError, setMapSearchError] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [googlePlacePreview, setGooglePlacePreview] = useState(null);
  const [googlePlaceLoading, setGooglePlaceLoading] = useState(false);
  const [deletedPlace, setDeletedPlace] = useState(null);
  const [toast, setToast] = useState('');
  const mapSearchSessionRef = useRef(createPlaceSearchSession());
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
    offline: { label: 'Sin conexión; cambios en cola', color: 'warning.main' },
    error: { label: 'Error de sincronización', color: 'error.main' },
    local: { label: 'Modo local', color: 'warning.main' },
  }[syncState.status];

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToast('');
      setDeletedPlace(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!mapSearchOpen) {
      setMapSearchLoading(false);
      return undefined;
    }

    const query = mapSearchQuery.trim();
    if (query.length < 3) {
      setMapSearchResults([]);
      setMapSearchError('');
      setMapSearchLoading(false);
      return undefined;
    }

    let ignore = false;
    const timeoutId = window.setTimeout(async () => {
      setMapSearchLoading(true);
      setMapSearchError('');

      try {
        const results = await searchLocation(query, {
          ...mapSearchBias,
          session: mapSearchSessionRef.current,
          allowTextSearch: true,
        });
        if (!ignore) {
          setMapSearchResults(results);
          if (!results.length) setMapSearchError('No he encontrado esa ubicación.');
        }
      } catch (error) {
        if (!ignore) {
          captureDiagnostic('search.main.suggestions', error);
          setMapSearchResults([]);
          setMapSearchError(error.message);
        }
      } finally {
        if (!ignore) setMapSearchLoading(false);
      }
    }, 350);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [mapSearchBias, mapSearchOpen, mapSearchQuery]);

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
    const allowCurrentFallback = options.allowCurrentFallback ?? (!place.address?.trim() && !place.sourceUrl);
    let coordinates = hasValidCoordinates(place)
      ? {
          lat: Number(place.lat),
          lng: Number(place.lng),
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
        ...place,
        address: place.address || locationResult?.address || '',
        zone: place.zone || locationResult?.zone || '',
        lat: coordinates.lat,
        lng: coordinates.lng,
        category: place.category && place.category !== 'other' ? place.category : locationResult?.category || place.category || 'other',
        providerType: place.providerType || locationResult?.providerType || '',
        rating: Number(place.rating || 0),
        tags: place.tags || [],
      }),
      approximate,
    };
  }

  async function handleSavePlace(place) {
    let result;
    const mode = place.id ? 'edit' : 'create';
    recordBreadcrumb('place.save.started', { mode });

    try {
      result = await buildPlacePayload(place);
    } catch (error) {
      captureDiagnostic('place.save.location', error, { mode });
      setToast(error.message);
      return false;
    }

    const { payload, approximate } = result;

    if (payload.id) {
      await placesStore.updateItem(payload.id, payload);
      setSelectedPlaceId(payload.id);
      setToast(`Lugar actualizado${approximate ? ' con ubicación aproximada' : ''}.`);
    } else {
      const created = await placesStore.addItem(payload);
      setSelectedPlaceId(created.id);
      setToast(`Lugar guardado${approximate ? ' con ubicación aproximada' : ''}.`);
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
    await placesStore.deleteItem(placeId);
    if (selectedPlaceId === placeId) setSelectedPlaceId(null);
    setDeletedPlace(place);
    setToast('Lugar eliminado.');
  }

  async function undoDeletePlace() {
    if (!deletedPlace) return;
    const restored = await placesStore.addItem(deletedPlace);
    setDeletedPlace(null);
    setSelectedPlaceId(restored.id);
    setToast('Lugar recuperado.');
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
    const candidate = await importPlaceFromUrl(url);
    await inboxStore.addItem(candidate);
    setLinkDialogOpen(false);
    openReview();
    setToast('Enlace analizado. Revísalo antes de guardarlo.');
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
      setToast(error.message);
      return;
    }

    const { payload, approximate } = result;
    const created = await placesStore.addItem(payload);
    await inboxStore.deleteItem(item.id);
    setSelectedPlaceId(created.id);
    setMapCenter({ lat: payload.lat, lng: payload.lng });
    setReviewOpen(false);
    setToast(`Recomendación guardada${approximate ? ' con ubicación aproximada' : ''}.`);
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

  async function handleDiscardInboxItem(itemId) {
    await inboxStore.deleteItem(itemId);
    setToast('Recomendación descartada.');
  }

  async function handleSearchSelect(result) {
    googlePlaceRequestRef.current += 1;
    setGooglePlacePreview(null);
    setGooglePlaceLoading(false);
    setSelectedPlaceId(null);
    setMapCenter({ lat: result.lat, lng: result.lng });
    if (locationStatus !== 'ready') {
      setManualPosition({ lat: result.lat, lng: result.lng, label: result.name });
      setToast(`${result.name} será tu referencia de cercanía.`);
    }
    setPlacesOpen(false);
    setReviewOpen(false);
  }

  async function handleInlineSearchSelect(result) {
    setMapSearchLoading(true);
    setMapSearchError('');

    try {
      const resolved = await resolveLocationSuggestion(result, mapSearchSessionRef.current);
      setMapSearchQuery(resolved.name || resolved.address || '');
      setMapSearchResults([]);
      setMapSearchOpen(false);
      await handleSearchSelect(resolved);
    } catch (error) {
      captureDiagnostic('search.main.resolve', error);
      setMapSearchError(error.message);
      setMapSearchOpen(true);
    } finally {
      setMapSearchLoading(false);
    }
  }

  async function handleInlineSearchSubmit(event) {
    event.preventDefault();
    const query = mapSearchQuery.trim();
    if (!query) return;

    if (query.length < 3) {
      setMapSearchOpen(true);
      setMapSearchError('Escribe al menos 3 caracteres.');
      return;
    }

    setMapSearchOpen(true);
    setMapSearchLoading(true);
    setMapSearchError('');

    try {
      const results = await searchLocation(query, {
        ...mapSearchBias,
        session: mapSearchSessionRef.current,
        allowTextSearch: true,
      });
      setMapSearchResults(results);
      if (!results.length) setMapSearchError('No he encontrado esa ubicación.');
    } catch (error) {
      captureDiagnostic('search.main.submit', error);
      setMapSearchResults([]);
      setMapSearchError(error.message);
    } finally {
      setMapSearchLoading(false);
    }
  }

  function clearInlineSearch() {
    resetPlaceSearchSession(mapSearchSessionRef.current);
    setMapSearchQuery('');
    setMapSearchResults([]);
    setMapSearchError('');
    setMapSearchLoading(false);
    setMapSearchOpen(false);
  }

  function selectPlace(place) {
    if (!hasValidCoordinates(place)) return;
    googlePlaceRequestRef.current += 1;
    setGooglePlacePreview(null);
    setGooglePlaceLoading(false);
    setSelectedPlaceId(place.id);
    setMapCenter({ lat: Number(place.lat), lng: Number(place.lng) });
    if (!isDesktop) setPlacesOpen(false);
  }

  async function centerOnUser() {
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
        setToast(error.message);
      }
    } finally {
      if (requestId === googlePlaceRequestRef.current) setGooglePlaceLoading(false);
    }
  }

  function openDirections(place) {
    if (!hasValidCoordinates(place)) return;

    const lat = Number(place.lat);
    const lng = Number(place.lng);
    const label = encodeURIComponent(place.name || 'Destino');
    window.open(`https://maps.apple.com/?daddr=${lat},${lng}&q=${label}`, '_blank', 'noopener,noreferrer');
  }

  const showMapSearchPanel = mapSearchOpen && (mapSearchQuery.trim().length > 0 || mapSearchLoading || mapSearchError);

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
        <ClickAwayListener onClickAway={() => setMapSearchOpen(false)}>
          <Box sx={{ maxWidth: 680, mx: 'auto', position: 'relative', pointerEvents: 'auto' }}>
            <Paper
              elevation={0}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.6,
                height: 58,
                px: 0.65,
                borderRadius: '18px',
                bgcolor: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(8,75,67,0.10)',
                boxShadow: '0 18px 48px rgba(6,42,48,0.16)',
                backdropFilter: 'blur(22px)',
              }}
            >
              <Tooltip title="Menú">
                <IconButton aria-label="Abrir menú" onClick={() => setMenuOpen(true)}>
                  <MenuIcon />
                </IconButton>
              </Tooltip>
              <Box
                component="form"
                onSubmit={handleInlineSearchSubmit}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  height: 46,
                  px: 1,
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.9,
                  bgcolor: mapSearchOpen ? 'rgba(8,75,67,0.06)' : 'transparent',
                  transition: 'background-color 160ms ease',
                }}
              >
                <SearchIcon fontSize="small" color="action" />
                <InputBase
                  value={mapSearchQuery}
                  onFocus={() => setMapSearchOpen(true)}
                  onChange={(event) => {
                    setMapSearchQuery(event.target.value);
                    setMapSearchOpen(true);
                  }}
                  placeholder="Buscar en el mapa"
                  inputProps={{ 'aria-label': 'Buscar en el mapa' }}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    '& input': {
                      p: 0,
                      fontWeight: 850,
                      fontSize: { xs: 15, sm: 16 },
                      color: 'text.primary',
                    },
                    '& input::placeholder': {
                      opacity: 1,
                      color: 'text.secondary',
                    },
                  }}
                />
                {mapSearchLoading ? (
                  <CircularProgress size={18} />
                ) : (
                  mapSearchQuery && (
                    <IconButton type="button" aria-label="Limpiar búsqueda" size="small" onClick={clearInlineSearch}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )
                )}
              </Box>
              <Tooltip title={syncMeta.label}>
                <Box
                  role="status"
                  aria-label={syncMeta.label}
                  sx={{ width: 8, height: 8, mr: 1.2, borderRadius: 99, bgcolor: syncMeta.color }}
                />
              </Tooltip>
            </Paper>

            {showMapSearchPanel && (
              <Paper
                elevation={0}
                sx={{
                  mt: 1,
                  maxHeight: { xs: 310, sm: 360 },
                  overflow: 'auto',
                  borderRadius: '16px',
                  bgcolor: 'rgba(255,255,255,0.97)',
                  border: '1px solid rgba(8,75,67,0.10)',
                  boxShadow: '0 24px 60px rgba(6,42,48,0.18)',
                  backdropFilter: 'blur(22px)',
                }}
              >
                {mapSearchQuery.trim().length < 3 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.6 }}>
                    Escribe al menos 3 caracteres para buscar.
                  </Typography>
                ) : mapSearchError ? (
                  <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.6 }}>
                    {mapSearchError}
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {mapSearchResults.map((result, index) => (
                      <ListItemButton
                        key={`${result.id || `${result.name}-${result.lat}-${result.lng}`}-${index}`}
                        onClick={() => void handleInlineSearchSelect(result)}
                        sx={{ px: 2, py: 1.15, borderTop: index ? '1px solid rgba(8,75,67,0.08)' : 0 }}
                      >
                        <ListItemText
                          primary={result.name}
                          secondary={result.address}
                          primaryTypographyProps={{ fontWeight: 850, noWrap: true }}
                          secondaryTypographyProps={{ noWrap: true }}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Paper>
            )}
          </Box>
        </ClickAwayListener>
      </Box>

      <Stack
        sx={{
          position: 'absolute',
          right: { xs: 12, md: 18 },
          top: 'calc(88px + env(safe-area-inset-top))',
          gap: 1,
          zIndex: 950,
        }}
      >
        <Tooltip title={locationStatus === 'ready' ? 'Mi ubicación' : 'Referencia de cercanía'}>
          <IconButton
            aria-label="Ir a mi ubicación"
            onClick={() => void centerOnUser()}
            sx={{ bgcolor: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 26px rgba(6,42,48,0.14)', backdropFilter: 'blur(18px)' }}
          >
            <MyLocationIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Filtrar mapa">
          <IconButton
            aria-label="Filtrar mapa"
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

      {filtersActive > 0 && (
        <Button
          size="small"
          startIcon={<FilterListIcon />}
          onClick={openFilters}
          sx={{
            position: 'absolute',
            left: { xs: 14, md: 18 },
            top: 'calc(82px + env(safe-area-inset-top))',
            zIndex: 930,
            bgcolor: 'rgba(255,255,255,0.92)',
            color: 'primary.dark',
            boxShadow: '0 12px 30px rgba(6,42,48,0.14)',
            backdropFilter: 'blur(18px)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.98)' },
          }}
        >
          {filtersActive} filtros de mapa
        </Button>
      )}

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

      {toast && (
        <Alert
          severity="success"
          onClose={() => {
            setToast('');
            if (toast === 'Lugar eliminado.') setDeletedPlace(null);
          }}
          action={
            toast === 'Lugar eliminado.' && deletedPlace ? (
              <Button color="inherit" size="small" onClick={() => void undoDeletePlace()}>
                Deshacer
              </Button>
            ) : undefined
          }
          sx={{
            position: 'absolute',
            left: { xs: 12, md: 18 },
            right: { xs: 12, md: 'auto' },
            bottom: selectedPlace || googlePlacePreview || googlePlaceLoading ? 'calc(154px + env(safe-area-inset-bottom))' : 'calc(88px + env(safe-area-inset-bottom))',
            zIndex: 980,
            width: { md: 390 },
            borderRadius: '14px',
            boxShadow: '0 18px 44px rgba(6,42,48,0.18)',
          }}
        >
          {toast}
        </Alert>
      )}

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
        draftStorageKey={`rumbo.${user.uid}.placeDraft`}
        onSave={async (place) => {
          const saved = await handleSavePlace(place);
          if (saved && place.inboxId) await inboxStore.deleteItem(place.inboxId);
          return saved;
        }}
      />
      <LinkImportDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onImport={handleImportLink}
      />
      <FilterDrawer open={filtersOpen} filters={mapFilters} setFilters={setMapFilters} onClose={() => setFiltersOpen(false)} places={places} />
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
          onClose={() => setMenuOpen(false)}
          onImportLink={() => setLinkDialogOpen(true)}
          onOpenReview={openReview}
          onRetrySync={() => void retrySync()}
        />
      </Drawer>
    </Box>
  );
}
