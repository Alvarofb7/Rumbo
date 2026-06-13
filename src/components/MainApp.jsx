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
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import RouteIcon from '@mui/icons-material/Route';
import SearchIcon from '@mui/icons-material/Search';
import { useTheme } from '@mui/material/styles';
import { demoInbox, demoPlaces, statusOptions } from '../data/demoData';
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
  resolvedUrl: '',
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [toast, setToast] = useState('');
  const panelScrollRef = useRef(null);

  const places = placesStore.items;
  const inbox = inboxStore.items;
  const filteredPlaces = usePlaceFilters(places, filters, position);
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) || null;
  const mapHeight = panelCollapsed ? '100dvh' : panelExpanded ? '34dvh' : tab === 'map' ? '66dvh' : '56dvh';
  const panelHeight = panelCollapsed ? '0px' : panelExpanded ? '68dvh' : tab === 'map' ? '36dvh' : '48dvh';

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
    panelScrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  function changeTab(nextTab) {
    if (nextTab !== tab) setToast('');
    setPanelCollapsed(false);
    setPanelExpanded(false);
    setTab(nextTab);
  }

  function openCreatePlace(prefill = null) {
    setEditingPlace(prefill || { ...emptyPlace });
    setPlaceDialogOpen(true);
  }

  function openEditPlace(place) {
    setEditingPlace(place);
    setPlaceDialogOpen(true);
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
      throw new Error('No he podido ubicar este lugar. Elige un resultado en "Buscar sitio en el mapa" antes de guardarlo.');
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
    setPanelCollapsed(false);
    setPanelExpanded(false);
    setTab('map');
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
    setPanelCollapsed(false);
    setPanelExpanded(false);
    setTab('inbox');
    setToast('Enlace analizado y enviado a Revisar.');
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
    setPanelCollapsed(false);
    setPanelExpanded(false);
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
    setMapCenter({ lat: result.lat, lng: result.lng });
    if (locationStatus !== 'ready') {
      setManualPosition({ lat: result.lat, lng: result.lng, label: result.name });
      setToast(`${result.name} será tu referencia de cercanía.`);
    }
    setTab('map');
    setPanelCollapsed(false);
    setPanelExpanded(false);
  }

  function selectPlace(place, options = {}) {
    if (!hasValidCoordinates(place)) return;
    setSelectedPlaceId(place.id);
    setMapCenter({ lat: Number(place.lat), lng: Number(place.lng) });
    if (options.openMapTab !== false) setTab('map');
    setPanelCollapsed(false);
    setPanelExpanded(false);
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

  function openZone(zone) {
    setFilters((current) => ({ ...current, zone, sort: zone ? 'zone' : 'nearest' }));
    setTab('map');
    setPanelCollapsed(false);
    setPanelExpanded(false);
    setToast(zone ? `Mostrando lugares de ${zone}.` : 'Mostrando todas las zonas.');
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
    trips: <TripsPanel places={places} onSelectZone={openZone} />,
  }[tab];

  return (
    <Box sx={{ height: '100dvh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateRows: { xs: 'auto minmax(0, 1fr)', md: '1fr' },
          gridTemplateColumns: { xs: '1fr', md: panelCollapsed ? '1fr 0px' : 'minmax(0, 1fr) 430px' },
          height: '100%',
        }}
      >
        <Box sx={{ position: 'relative', minHeight: 0, height: { xs: mapHeight, md: '100dvh' } }}>
          <MapPanel
            places={filteredPlaces}
            selectedPlace={selectedPlace}
            userPosition={position}
            center={mapCenter || position}
            onDirections={openDirections}
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
              background: 'linear-gradient(180deg, rgba(247,244,237,0.98), rgba(247,244,237,0.84) 74%, rgba(247,244,237,0))',
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
                Buscar o pegar enlace
              </Button>
            </Box>
          </AppBar>

          <Stack sx={{ position: 'absolute', right: 12, top: 132, gap: 1 }}>
            <Tooltip title={panelCollapsed ? 'Mostrar panel' : 'Ver solo mapa'}>
              <IconButton
                onClick={() => {
                  setPanelCollapsed((current) => !current);
                  setPanelExpanded(false);
                }}
                sx={{ bgcolor: 'background.paper', boxShadow: '0 8px 20px rgba(6,42,48,0.14)' }}
              >
                {panelCollapsed ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Filtros">
              <IconButton onClick={() => setFiltersOpen(true)} sx={{ bgcolor: 'background.paper', boxShadow: '0 8px 20px rgba(6,42,48,0.14)' }}>
                <FilterListIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={locationStatus === 'ready' ? 'Mi ubicación' : 'Referencia de cercanía'}>
              <IconButton onClick={centerOnUser} sx={{ bgcolor: 'background.paper', boxShadow: '0 8px 20px rgba(6,42,48,0.14)' }}>
                <MyLocationIcon />
              </IconButton>
            </Tooltip>
          </Stack>

          <Button
            startIcon={<MyLocationIcon />}
            onClick={centerOnUser}
            sx={{
              position: 'absolute',
              left: { xs: 14, md: 18 },
              bottom: { xs: 20, md: 22 },
              minHeight: 42,
              px: 1.6,
              bgcolor: 'rgba(255,255,255,0.94)',
              color: 'primary.dark',
              border: '1px solid rgba(15,107,95,0.14)',
              borderRadius: 999,
              boxShadow: '0 10px 24px rgba(6,42,48,0.14)',
              backdropFilter: 'blur(14px)',
              '&:hover': { bgcolor: '#fff' },
            }}
          >
            {locationStatus === 'ready' ? 'Mi ubicación' : 'Referencia'}
          </Button>

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
            borderRadius: { xs: '26px 26px 0 0', md: 0 },
            borderLeft: { md: '1px solid rgba(0,97,111,0.12)' },
            mt: { xs: -2, md: 0 },
            zIndex: 20,
            overflow: 'hidden',
            display: panelCollapsed ? 'none' : 'grid',
            gridTemplateRows: 'minmax(0, 1fr) auto',
            boxShadow: { xs: '0 -18px 46px rgba(6,42,48,0.16)', md: 'none' },
          }}
        >
          <Box ref={panelScrollRef} sx={{ display: panelCollapsed ? 'none' : 'block', overflow: 'auto', pt: { xs: 1, md: 2 }, pb: 1 }}>
            {!isDesktop && (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, mb: 1, minHeight: 36, position: 'relative' }}>
                <Box sx={{ width: 44, height: 5, borderRadius: 99, bgcolor: 'divider', mx: 'auto', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }} />
                <Button
                  size="small"
                  onClick={() => setPanelExpanded((current) => !current)}
                  startIcon={panelExpanded ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
                  sx={{ ml: 'auto', minHeight: 34, borderRadius: 999, color: 'text.secondary' }}
                >
                  {panelExpanded ? 'Menos' : 'Más'}
                </Button>
              </Stack>
            )}
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
            <BottomNavigation
              value={tab}
              onChange={(_, value) => changeTab(value)}
              showLabels
              sx={{
                '& .MuiBottomNavigationAction-root': {
                  mx: 0.35,
                  my: 0.55,
                  minWidth: 0,
                  borderRadius: 2,
                  color: 'text.secondary',
                  transition: 'none',
                },
                '& .Mui-selected': {
                  bgcolor: 'primary.light',
                  color: 'primary.dark',
                  fontWeight: 800,
                },
                '& .MuiBottomNavigationAction-label': {
                  fontSize: 12,
                  transition: 'none',
                },
              }}
            >
              <BottomNavigationAction label="Mapa" value="map" icon={<MapIcon />} />
              <BottomNavigationAction label="Lugares" value="saved" icon={<BookmarkBorderIcon />} />
              <BottomNavigationAction
                label="Revisar"
                value="inbox"
                icon={
                  <Badge badgeContent={inbox.length} color="primary">
                    <InboxIcon />
                  </Badge>
                }
              />
              <BottomNavigationAction label="Zonas" value="trips" icon={<RouteIcon />} />
            </BottomNavigation>
          </Box>
        </Paper>
      </Box>

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
