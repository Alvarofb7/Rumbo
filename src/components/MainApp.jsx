import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonBase,
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
import { searchLocation } from '../lib/geo';
import { importPlaceFromUrl } from '../lib/placeImporter';
import FilterDrawer from './filters/FilterDrawer';
import InboxPanel from './panels/InboxPanel';
import LinkImportDialog from './dialogs/LinkImportDialog';
import MapPanel from './map/MapPanel';
import PlaceDialog from './dialogs/PlaceDialog';
import PlacesPanel from './panels/PlacesPanel';
import SelectedPlaceCard from './cards/SelectedPlaceCard';
import AppMenuDrawer from './navigation/AppMenuDrawer';

const emptyPlace = {
  name: '',
  address: '',
  zone: '',
  lat: '',
  lng: '',
  tags: [],
  rating: 0,
  status: 'wishlist',
  notes: '',
  sourceType: 'manual',
  sourceUrl: '',
  resolvedUrl: '',
  imageUrl: '',
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
    filters.sort !== 'nearest',
  ].filter(Boolean).length;
}

function DataDrawer({ open, title, subtitle, isDesktop, onClose, children }) {
  return (
    <Drawer
      anchor={isDesktop ? 'right' : 'bottom'}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', md: 430 },
          maxWidth: '100vw',
          height: { xs: '82dvh', md: '100dvh' },
          borderRadius: { xs: '30px 30px 0 0', md: '28px 0 0 28px' },
          overflow: 'hidden',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
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
            <Typography variant="body2" color="text.secondary" noWrap>
              {subtitle}
            </Typography>
          </Box>
          <IconButton aria-label={`Cerrar ${title}`} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ minHeight: 0, overflow: 'auto', py: 1.4, pb: `calc(18px + env(safe-area-inset-bottom))` }}>
        {children}
      </Box>
    </Drawer>
  );
}

export default function MainApp() {
  const { user, firebaseReady } = useAuth();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { position, status: locationStatus, error: locationError, setManualPosition } = useUserLocation();
  const placesStore = useUserCollection(user, 'places', demoPlaces);
  const inboxStore = useUserCollection(user, 'inbox', demoInbox);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toast, setToast] = useState('');

  const places = placesStore.items;
  const inbox = inboxStore.items;
  const filteredPlaces = usePlaceFilters(places, filters, position);
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) || null;
  const filtersActive = activeFilterCount(filters);

  const stats = useMemo(() => {
    return {
      saved: places.length,
      pending: places.filter((place) => place.status === 'wishlist').length,
      review: inbox.length,
      visited: places.filter((place) => place.status === 'visited').length,
      favorites: places.filter((place) => place.status === 'favorite').length,
    };
  }, [inbox.length, places]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  function openCreatePlace(prefill = null) {
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
        const [result] = await searchLocation(query);
        if (result) return result;
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
      payload: {
        ...place,
        address: place.address || locationResult?.address || '',
        zone: place.zone || locationResult?.zone || '',
        lat: coordinates.lat,
        lng: coordinates.lng,
        rating: Number(place.rating || 0),
        tags: place.tags || [],
        imageUrl: place.imageUrl || '',
      },
      approximate,
    };
  }

  async function handleSavePlace(place) {
    let result;

    try {
      result = await buildPlacePayload(place);
    } catch (error) {
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
    return true;
  }

  async function handleDeletePlace(placeId) {
    await placesStore.deleteItem(placeId);
    if (selectedPlaceId === placeId) setSelectedPlaceId(null);
    setToast('Lugar eliminado.');
  }

  async function handleImportLink(url) {
    const candidate = await importPlaceFromUrl(url);
    await inboxStore.addItem(candidate);
    setLinkDialogOpen(false);
    openReview();
    setToast('Enlace analizado. Revísalo antes de guardarlo.');
  }

  async function handleSaveInboxItem(item) {
    const place = {
      name: item.title,
      address: item.address,
      zone: item.zone,
      lat: item.lat || '',
      lng: item.lng || '',
      tags: item.tags || [],
      rating: item.rating || 0,
      status: 'wishlist',
      notes: item.notes || '',
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      resolvedUrl: item.resolvedUrl || '',
      imageUrl: item.imageUrl || '',
    };
    let result;

    try {
      result = await buildPlacePayload(place, { allowCurrentFallback: false });
    } catch (error) {
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
      tags: item.tags || [],
      rating: item.rating || 0,
      notes: item.notes || '',
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      resolvedUrl: item.resolvedUrl || '',
      imageUrl: item.imageUrl || '',
      inboxId: item.id,
    });
  }

  async function handleDiscardInboxItem(itemId) {
    await inboxStore.deleteItem(itemId);
    setToast('Recomendación descartada.');
  }

  async function handleSearchSelect(result) {
    setSelectedPlaceId(null);
    setMapCenter({ lat: result.lat, lng: result.lng });
    if (locationStatus !== 'ready') {
      setManualPosition({ lat: result.lat, lng: result.lng, label: result.name });
      setToast(`${result.name} será tu referencia de cercanía.`);
    }
    setPlacesOpen(false);
    setReviewOpen(false);
  }

  function selectPlace(place) {
    if (!hasValidCoordinates(place)) return;
    setSelectedPlaceId(place.id);
    setMapCenter({ lat: Number(place.lat), lng: Number(place.lng) });
    if (!isDesktop) setPlacesOpen(false);
  }

  function centerOnUser() {
    setSelectedPlaceId(null);
    setMapCenter({ lat: position.lat, lng: position.lng });
    setToast(locationStatus === 'ready' ? 'Centrado en tu ubicación.' : 'Centrado en tu referencia.');
  }

  function openDirections(place) {
    if (!hasValidCoordinates(place)) return;

    const lat = Number(place.lat);
    const lng = Number(place.lng);
    const label = encodeURIComponent(place.name || 'Destino');
    window.open(`https://maps.apple.com/?daddr=${lat},${lng}&q=${label}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <Box sx={{ height: '100dvh', bgcolor: 'background.default', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <MapPanel
          places={filteredPlaces}
          selectedPlace={selectedPlace}
          userPosition={position}
          center={mapCenter || position}
          onDirections={openDirections}
          onSelectPlace={selectPlace}
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
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.6,
            maxWidth: 680,
            height: 58,
            mx: 'auto',
            px: 0.65,
            borderRadius: 999,
            bgcolor: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(8,75,67,0.10)',
            boxShadow: '0 18px 48px rgba(6,42,48,0.16)',
            backdropFilter: 'blur(22px)',
            pointerEvents: 'auto',
          }}
        >
          <Tooltip title="Menú">
            <IconButton aria-label="Abrir menú" onClick={() => setMenuOpen(true)}>
              <MenuIcon />
            </IconButton>
          </Tooltip>
          <ButtonBase
            aria-label="Buscar lugar o pegar enlace"
            onClick={() => setLinkDialogOpen(true)}
            sx={{
              flex: 1,
              minWidth: 0,
              height: 46,
              px: 0.8,
              borderRadius: 999,
              justifyContent: 'flex-start',
              color: 'text.secondary',
              gap: 1,
            }}
          >
            <SearchIcon fontSize="small" />
            <Box sx={{ minWidth: 0, textAlign: 'left' }}>
              <Typography noWrap fontWeight={800} sx={{ lineHeight: 1.1 }}>
                Buscar o pegar enlace
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>
                Lugares, barrios, Google Maps, Apple Maps o Tripadvisor
              </Typography>
            </Box>
          </ButtonBase>
          <Tooltip title={firebaseReady ? 'Sincronizado' : 'Modo local'}>
            <Box sx={{ width: 8, height: 8, mr: 1.2, borderRadius: 99, bgcolor: firebaseReady ? 'success.main' : 'warning.main' }} />
          </Tooltip>
        </Paper>
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
            onClick={centerOnUser}
            sx={{ bgcolor: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 26px rgba(6,42,48,0.14)', backdropFilter: 'blur(18px)' }}
          >
            <MyLocationIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Filtros y zonas">
          <IconButton
            aria-label="Abrir filtros"
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
          {filtersActive} filtros activos
        </Button>
      )}

      {locationStatus !== 'ready' && locationError && !selectedPlace && (
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
            borderRadius: 999,
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
          onClose={() => setToast('')}
          sx={{
            position: 'absolute',
            left: { xs: 12, md: 18 },
            right: { xs: 12, md: 'auto' },
            bottom: selectedPlace ? 'calc(154px + env(safe-area-inset-bottom))' : 'calc(88px + env(safe-area-inset-bottom))',
            zIndex: 980,
            width: { md: 390 },
            borderRadius: 3,
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
          display: selectedPlace ? 'none' : 'inline-flex',
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

      <DataDrawer
        open={placesOpen}
        title="Mis lugares"
        subtitle={`${filteredPlaces.length} visibles · ${places.length} guardados`}
        isDesktop={isDesktop}
        onClose={() => setPlacesOpen(false)}
      >
        <PlacesPanel
          places={filteredPlaces}
          selectedPlace={selectedPlace}
          filters={filters}
          setFilters={setFilters}
          stats={stats}
          onSelect={selectPlace}
          onEdit={openEditPlace}
          onDelete={handleDeletePlace}
          onDirections={openDirections}
          onOpenFilters={openFilters}
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
        onSave={async (place) => {
          const saved = await handleSavePlace(place);
          if (saved && place.inboxId) await inboxStore.deleteItem(place.inboxId);
        }}
      />
      <LinkImportDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onImport={handleImportLink}
        onSearchSelect={handleSearchSelect}
      />
      <FilterDrawer open={filtersOpen} filters={filters} setFilters={setFilters} onClose={() => setFiltersOpen(false)} places={places} />
      <Drawer
        anchor="left"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        PaperProps={{ sx: { borderRadius: '0 28px 28px 0' } }}
      >
        <AppMenuDrawer
          stats={stats}
          places={places}
          inbox={inbox}
          firebaseReady={firebaseReady}
          onClose={() => setMenuOpen(false)}
          onOpenPlaces={openPlaces}
          onOpenReview={openReview}
          onOpenFilters={openFilters}
        />
      </Drawer>
    </Box>
  );
}
