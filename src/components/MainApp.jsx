import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Avatar,
  Badge,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Drawer,
  Fab,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import FilterListIcon from '@mui/icons-material/FilterList';
import InboxIcon from '@mui/icons-material/Inbox';
import LinkIcon from '@mui/icons-material/Link';
import MapIcon from '@mui/icons-material/Map';
import RouteIcon from '@mui/icons-material/Route';
import SearchIcon from '@mui/icons-material/Search';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { useTheme } from '@mui/material/styles';
import { demoInbox, demoPlaces, statusOptions } from '../data/demoData';
import { useAuth } from '../context/AuthContext';
import { useUserCollection } from '../hooks/useFirestoreCollection';
import { usePlaceFilters } from '../hooks/usePlaceFilters';
import { useUserLocation } from '../hooks/useUserLocation';
import { searchLocation } from '../lib/geo';
import { parsePlaceLink } from '../lib/linkParser';
import FilterDrawer from './filters/FilterDrawer';
import InboxPanel from './panels/InboxPanel';
import LinkImportDialog from './dialogs/LinkImportDialog';
import MapPanel from './map/MapPanel';
import PlaceDialog from './dialogs/PlaceDialog';
import PlacesPanel from './panels/PlacesPanel';
import ProfileDrawer from './profile/ProfileDrawer';
import SearchDialog from './dialogs/SearchDialog';
import TripsPanel from './panels/TripsPanel';

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

export default function MainApp() {
  const { user, firebaseReady } = useAuth();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { position, status: locationStatus, error: locationError, setManualPosition } = useUserLocation();
  const placesStore = useUserCollection(user, 'places', demoPlaces);
  const inboxStore = useUserCollection(user, 'inbox', demoInbox);
  const [tab, setTab] = useState('map');
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState('');
  const panelScrollRef = useRef(null);

  const places = placesStore.items;
  const inbox = inboxStore.items;
  const filteredPlaces = usePlaceFilters(places, filters, position);
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) || null;
  const mapHeight = tab === 'map' ? '64dvh' : '52dvh';
  const panelHeight = tab === 'map' ? '36dvh' : '48dvh';

  const stats = useMemo(() => {
    return {
      saved: places.length,
      pending: places.filter((place) => place.status === 'wishlist').length + inbox.length,
      visited: places.filter((place) => place.status === 'visited').length,
      favorites: places.filter((place) => place.status === 'favorite').length,
    };
  }, [inbox.length, places]);

  useEffect(() => {
    panelScrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  function openCreatePlace(prefill = null) {
    setEditingPlace(prefill || { ...emptyPlace });
    setPlaceDialogOpen(true);
  }

  function openEditPlace(place) {
    setEditingPlace(place);
    setPlaceDialogOpen(true);
  }

  async function buildPlacePayload(place) {
    let coordinates = hasValidCoordinates(place)
      ? {
          lat: Number(place.lat),
          lng: Number(place.lng),
        }
      : { lat: Number.NaN, lng: Number.NaN };
    let approximate = false;

    if (!hasValidCoordinates(coordinates)) {
      const query = [place.address, place.name, place.zone].filter(Boolean).join(', ');

      if (query.trim()) {
        try {
          const [result] = await searchLocation(query);
          if (result) {
            coordinates = { lat: result.lat, lng: result.lng };
          }
        } catch {
          coordinates = { lat: Number.NaN, lng: Number.NaN };
        }
      }
    }

    if (!hasValidCoordinates(coordinates)) {
      coordinates = { lat: position.lat, lng: position.lng };
      approximate = true;
    }

    return {
      payload: {
        ...place,
        lat: coordinates.lat,
        lng: coordinates.lng,
        rating: Number(place.rating || 0),
        tags: place.tags || [],
      },
      approximate,
    };
  }

  async function handleSavePlace(place) {
    const { payload, approximate } = await buildPlacePayload(place);

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
    setTab('map');
  }

  async function handleDeletePlace(placeId) {
    await placesStore.deleteItem(placeId);
    if (selectedPlaceId === placeId) setSelectedPlaceId(null);
    setToast('Lugar eliminado.');
  }

  async function handleImportLink(url) {
    const candidate = parsePlaceLink(url);
    await inboxStore.addItem(candidate);
    setLinkDialogOpen(false);
    setTab('inbox');
    setToast('Enlace añadido a la bandeja.');
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
      imageUrl: item.imageUrl || '',
    };
    const { payload, approximate } = await buildPlacePayload(place);
    const created = await placesStore.addItem(payload);
    await inboxStore.deleteItem(item.id);
    setSelectedPlaceId(created.id);
    setMapCenter({ lat: payload.lat, lng: payload.lng });
    setTab('map');
    setToast(`Recomendación guardada en el mapa${approximate ? ' con ubicación aproximada' : ''}.`);
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
      imageUrl: item.imageUrl || '',
      inboxId: item.id,
    });
  }

  async function handleDiscardInboxItem(itemId) {
    await inboxStore.deleteItem(itemId);
    setToast('Recomendación descartada.');
  }

  async function handleSearchSelect(result) {
    setMapCenter({ lat: result.lat, lng: result.lng });
    if (locationStatus !== 'ready') {
      setManualPosition({ lat: result.lat, lng: result.lng, label: result.name });
      setToast(`${result.name} será tu referencia de cercanía.`);
    }
    setTab('map');
  }

  function selectPlace(place, options = {}) {
    if (!hasValidCoordinates(place)) return;
    setSelectedPlaceId(place.id);
    setMapCenter({ lat: Number(place.lat), lng: Number(place.lng) });
    if (options.openMapTab !== false) setTab('map');
  }

  function openDirections(place) {
    if (!hasValidCoordinates(place)) return;

    const lat = Number(place.lat);
    const lng = Number(place.lng);
    const label = encodeURIComponent(place.name || 'Destino');
    window.open(`https://maps.apple.com/?daddr=${lat},${lng}&q=${label}`, '_blank', 'noopener,noreferrer');
  }

  const panel = {
    map: (
      <PlacesPanel
        places={filteredPlaces}
        selectedPlace={selectedPlace}
        filters={filters}
        setFilters={setFilters}
        stats={stats}
        onSelect={(place) => {
          selectPlace(place, { openMapTab: false });
        }}
        onEdit={openEditPlace}
        onDelete={handleDeletePlace}
        onDirections={openDirections}
        onOpenFilters={() => setFiltersOpen(true)}
      />
    ),
    inbox: (
      <InboxPanel
        inbox={inbox}
        onAddLink={() => setLinkDialogOpen(true)}
        onSave={handleSaveInboxItem}
        onEdit={handleEditInboxItem}
        onDiscard={handleDiscardInboxItem}
      />
    ),
    saved: (
      <PlacesPanel
        places={filteredPlaces}
        selectedPlace={selectedPlace}
        filters={filters}
        setFilters={setFilters}
        stats={stats}
        title="Guardados"
        onSelect={(place) => {
          selectPlace(place);
        }}
        onEdit={openEditPlace}
        onDelete={handleDeletePlace}
        onDirections={openDirections}
        onOpenFilters={() => setFiltersOpen(true)}
      />
    ),
    trips: <TripsPanel places={places} onSelectZone={(zone) => setFilters((current) => ({ ...current, zone, sort: 'zone' }))} />,
  }[tab];

  return (
    <Box sx={{ height: '100dvh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateRows: { xs: 'auto minmax(0, 1fr)', md: '1fr' },
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 430px' },
          height: '100%',
        }}
      >
        <Box sx={{ position: 'relative', minHeight: 0, height: { xs: mapHeight, md: '100dvh' } }}>
          <MapPanel
            places={filteredPlaces}
            selectedPlace={selectedPlace}
            userPosition={position}
            center={mapCenter || position}
            onSelectPlace={(place) => {
              selectPlace(place);
            }}
          />

          <AppBar
            position="absolute"
            color="transparent"
            elevation={0}
            sx={{
              top: 0,
              background: 'linear-gradient(180deg, rgba(248,251,248,0.98), rgba(248,251,248,0.82) 74%, rgba(248,251,248,0))',
              pb: 5,
              pointerEvents: 'none',
            }}
          >
            <Toolbar sx={{ gap: 1, px: { xs: 1.5, sm: 2 }, pointerEvents: 'auto' }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                <Box component="img" src="/icons/icon-192.png" alt="Rumbo" sx={{ width: 36, height: 36, borderRadius: 1.6 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h4" noWrap>
                    Rumbo
                  </Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: firebaseReady ? 'success.main' : 'warning.main' }} />
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {firebaseReady ? 'Sincronizado' : 'Local'}
                    </Typography>
                  </Stack>
                </Box>
              </Stack>

              <Box sx={{ flex: 1 }} />

              <Tooltip title="Buscar">
                <IconButton onClick={() => setSearchOpen(true)} sx={{ bgcolor: 'background.paper', boxShadow: '0 8px 22px rgba(6,42,48,0.10)' }}>
                  <SearchIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Perfil">
                <IconButton onClick={() => setProfileOpen(true)} sx={{ p: 0.25 }}>
                  <Avatar src={user.photoURL || ''} sx={{ width: 38, height: 38, bgcolor: 'primary.main' }}>
                    {(user.displayName || user.email || 'R').charAt(0).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
            </Toolbar>

            <Box sx={{ px: 1.5, pointerEvents: 'auto' }}>
              <Button
                fullWidth
                startIcon={<LinkIcon />}
                onClick={() => setLinkDialogOpen(true)}
                sx={{
                  justifyContent: 'flex-start',
                  minHeight: 48,
                  bgcolor: 'background.paper',
                  color: 'text.secondary',
                  border: '1px solid rgba(0,97,111,0.14)',
                  boxShadow: '0 10px 26px rgba(6,42,48,0.10)',
                  '&:hover': { bgcolor: 'background.paper' },
                }}
              >
                Buscar lugar o pegar enlace
              </Button>
            </Box>
          </AppBar>

          <Stack sx={{ position: 'absolute', right: 12, top: 132, gap: 1 }}>
            <Tooltip title="Filtros">
              <IconButton onClick={() => setFiltersOpen(true)} sx={{ bgcolor: 'background.paper', boxShadow: '0 8px 20px rgba(6,42,48,0.14)' }}>
                <FilterListIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={locationStatus === 'ready' ? 'Mi ubicación' : 'Referencia de cercanía'}>
              <IconButton onClick={() => setMapCenter(position)} sx={{ bgcolor: 'background.paper', boxShadow: '0 8px 20px rgba(6,42,48,0.14)' }}>
                <TravelExploreIcon />
              </IconButton>
            </Tooltip>
          </Stack>

          <Fab
            color="secondary"
            aria-label="Añadir lugar"
            onClick={() => openCreatePlace()}
            sx={{
              position: 'absolute',
              right: { xs: 18, md: 24 },
              bottom: { xs: 18, md: 24 },
              width: 64,
              height: 64,
              boxShadow: '0 14px 34px rgba(249,184,38,0.42)',
            }}
          >
            <AddIcon fontSize="large" />
          </Fab>
        </Box>

        <Paper
          elevation={0}
          sx={{
            minHeight: 0,
            height: { xs: panelHeight, md: '100dvh' },
            borderRadius: { xs: '18px 18px 0 0', md: 0 },
            borderLeft: { md: '1px solid rgba(0,97,111,0.12)' },
            mt: { xs: -2, md: 0 },
            zIndex: 20,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateRows: 'minmax(0, 1fr) auto',
          }}
        >
          <Box ref={panelScrollRef} sx={{ overflow: 'auto', pt: { xs: 1, md: 2 }, pb: 1 }}>
            {!isDesktop && <Box sx={{ width: 44, height: 5, borderRadius: 99, bgcolor: 'divider', mx: 'auto', mb: 1.5 }} />}
            {locationStatus !== 'ready' && locationError && (
              <Alert severity={locationStatus === 'manual' ? 'success' : 'info'} sx={{ mx: 2, mb: 1.5 }}>
                {locationError}
              </Alert>
            )}
            {toast && (
              <Alert severity="success" onClose={() => setToast('')} sx={{ mx: 2, mb: 1.5 }}>
                {toast}
              </Alert>
            )}
            {panel}
          </Box>

          <Box sx={{ borderTop: '1px solid rgba(0,97,111,0.10)', bgcolor: 'background.paper', pb: 'env(safe-area-inset-bottom)' }}>
            <BottomNavigation value={tab} onChange={(_, value) => setTab(value)} showLabels>
              <BottomNavigationAction label="Mapa" value="map" icon={<MapIcon />} />
              <BottomNavigationAction
                label="Bandeja"
                value="inbox"
                icon={
                  <Badge badgeContent={inbox.length} color="primary">
                    <InboxIcon />
                  </Badge>
                }
              />
              <BottomNavigationAction label="Guardados" value="saved" icon={<BookmarkBorderIcon />} />
              <BottomNavigationAction label="Viajes" value="trips" icon={<RouteIcon />} />
            </BottomNavigation>
          </Box>
        </Paper>
      </Box>

      <PlaceDialog
        open={placeDialogOpen}
        place={editingPlace}
        onClose={() => setPlaceDialogOpen(false)}
        onSave={async (place) => {
          await handleSavePlace(place);
          if (place.inboxId) await inboxStore.deleteItem(place.inboxId);
        }}
      />
      <LinkImportDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onImport={handleImportLink}
        onSearchSelect={handleSearchSelect}
      />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} />
      <FilterDrawer open={filtersOpen} filters={filters} setFilters={setFilters} onClose={() => setFiltersOpen(false)} places={places} />
      <Drawer anchor="right" open={profileOpen} onClose={() => setProfileOpen(false)}>
        <ProfileDrawer
          stats={stats}
          places={places}
          inbox={inbox}
          firebaseReady={firebaseReady}
          statusOptions={statusOptions}
          onClose={() => setProfileOpen(false)}
        />
      </Drawer>
    </Box>
  );
}
