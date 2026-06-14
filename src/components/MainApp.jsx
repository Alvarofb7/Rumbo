import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  ButtonBase,
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
import FilterListIcon from '@mui/icons-material/FilterList';
import InboxIcon from '@mui/icons-material/Inbox';
import LinkIcon from '@mui/icons-material/Link';
import MapIcon from '@mui/icons-material/Map';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
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

const navItems = [
  { value: 'map', label: 'Mapa', icon: MapIcon },
  { value: 'saved', label: 'Lugares', icon: BookmarkBorderIcon },
  { value: 'inbox', label: 'Revisar', icon: InboxIcon },
  { value: 'trips', label: 'Zonas', icon: RouteIcon },
];

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
  const [sheetMode, setSheetMode] = useState('mid');
  const [toast, setToast] = useState('');
  const panelScrollRef = useRef(null);

  const places = placesStore.items;
  const inbox = inboxStore.items;
  const filteredPlaces = usePlaceFilters(places, filters, position);
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) || null;
  const sheetHidden = sheetMode === 'hidden';
  const sheetHeight = sheetMode === 'full' ? 'calc(100dvh - 88px)' : '44dvh';
  const floatingRight = { xs: 14, md: sheetHidden ? 18 : 454 };
  const panelTitle = {
    map: 'Cerca de ti',
    saved: 'Lugares',
    inbox: 'Revisar',
    trips: 'Zonas',
  }[tab];
  const panelSubtitle = {
    map: `${filteredPlaces.length} filtrados`,
    saved: `${filteredPlaces.length} guardados`,
    inbox: `${inbox.length} pendientes`,
    trips: `${places.length} lugares`,
  }[tab];

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
    setSheetMode(isDesktop ? 'full' : 'mid');
    setTab(nextTab);
  }

  function showSheet(mode = 'mid') {
    setSheetMode(isDesktop ? 'full' : mode);
  }

  function toggleSheetSize() {
    setSheetMode((current) => (current === 'full' ? 'mid' : 'full'));
  }

  function toggleMapOnly() {
    setSheetMode((current) => (current === 'hidden' ? (isDesktop ? 'full' : 'mid') : 'hidden'));
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
    showSheet('mid');
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
    showSheet('mid');
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
    showSheet('mid');
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
    showSheet('mid');
  }

  function selectPlace(place, options = {}) {
    if (!hasValidCoordinates(place)) return;
    setSelectedPlaceId(place.id);
    setMapCenter({ lat: Number(place.lat), lng: Number(place.lng) });
    if (options.openMapTab !== false) setTab('map');
    showSheet('mid');
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
    showSheet('mid');
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
    <Box sx={{ height: '100dvh', bgcolor: 'background.default', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 1 }}>
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
      </Box>

      <Box
        sx={{
          position: 'absolute',
          top: 'calc(12px + env(safe-area-inset-top))',
          left: { xs: 12, md: 18 },
          right: { xs: 12, md: sheetHidden ? 18 : 454 },
          zIndex: 960,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            height: 58,
            px: 0.7,
            borderRadius: 999,
            bgcolor: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(8,75,67,0.10)',
            boxShadow: '0 18px 48px rgba(6,42,48,0.16)',
            backdropFilter: 'blur(22px)',
          }}
        >
          <ButtonBase
            aria-label="Buscar lugar o pegar enlace"
            onClick={() => setLinkDialogOpen(true)}
            sx={{
              flex: 1,
              minWidth: 0,
              height: 46,
              px: 1.2,
              borderRadius: 999,
              justifyContent: 'flex-start',
              color: 'text.secondary',
              gap: 1,
            }}
          >
            <SearchIcon fontSize="small" />
            <Typography noWrap fontWeight={750}>
              Buscar o pegar enlace
            </Typography>
          </ButtonBase>
          <Tooltip title={firebaseReady ? 'Sincronizado' : 'Modo local'}>
            <Box sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: firebaseReady ? 'success.main' : 'warning.main' }} />
          </Tooltip>
          <Tooltip title="Perfil">
            <IconButton onClick={() => setProfileOpen(true)} sx={{ p: 0.2 }}>
              <Avatar src={user.photoURL || ''} sx={{ width: 42, height: 42, bgcolor: 'primary.main', fontWeight: 800 }}>
                {(user.displayName || user.email || 'R').charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Paper>
      </Box>

      <Stack sx={{ position: 'absolute', right: floatingRight, top: 'calc(86px + env(safe-area-inset-top))', gap: 1, zIndex: 950 }}>
        <Tooltip title={locationStatus === 'ready' ? 'Mi ubicación' : 'Referencia de cercanía'}>
          <IconButton onClick={centerOnUser} sx={{ bgcolor: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 26px rgba(6,42,48,0.14)', backdropFilter: 'blur(18px)' }}>
            <MyLocationIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Filtros">
          <IconButton onClick={() => setFiltersOpen(true)} sx={{ bgcolor: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 26px rgba(6,42,48,0.14)', backdropFilter: 'blur(18px)' }}>
            <FilterListIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={sheetHidden ? 'Mostrar panel' : 'Ver solo mapa'}>
          <IconButton onClick={toggleMapOnly} sx={{ bgcolor: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 26px rgba(6,42,48,0.14)', backdropFilter: 'blur(18px)' }}>
            {sheetHidden ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
        </Tooltip>
      </Stack>

      <Fab
        color="secondary"
        aria-label="Añadir lugar"
        onClick={() => openCreatePlace()}
        sx={{
          position: 'absolute',
          right: { xs: 18, md: sheetHidden ? 24 : 466 },
          bottom: {
            xs: sheetHidden ? 'calc(22px + env(safe-area-inset-bottom))' : sheetMode === 'full' ? 'calc(100dvh - 74px)' : 'calc(44dvh + 18px)',
            md: 24,
          },
          display: sheetHidden ? 'inline-flex' : 'none',
          zIndex: 955,
          width: 60,
          height: 60,
          boxShadow: '0 16px 34px rgba(216,133,47,0.34)',
        }}
      >
        <AddIcon fontSize="large" />
      </Fab>

      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          left: { xs: 0, md: 'auto' },
          right: 0,
          bottom: 0,
          width: { xs: '100%', md: 430 },
          height: { xs: sheetHidden ? 0 : sheetHeight, md: sheetHidden ? 0 : '100dvh' },
          transform: sheetHidden ? 'translateY(calc(100% + 24px))' : 'translateY(0)',
          transition: 'height 240ms ease, transform 240ms ease',
          zIndex: 940,
          overflow: 'hidden',
          display: sheetHidden ? 'none' : 'grid',
          gridTemplateRows: 'auto auto minmax(0, 1fr)',
          borderRadius: { xs: '30px 30px 0 0', md: '28px 0 0 28px' },
          bgcolor: 'rgba(255,255,255,0.96)',
          border: '1px solid rgba(8,75,67,0.10)',
          borderRight: { md: 0 },
          boxShadow: { xs: '0 -24px 60px rgba(6,42,48,0.20)', md: '-22px 0 56px rgba(6,42,48,0.14)' },
          backdropFilter: 'blur(24px)',
        }}
      >
        <ButtonBase
          aria-label={sheetMode === 'full' ? 'Reducir panel' : 'Ampliar panel'}
          onClick={toggleSheetSize}
          sx={{ height: { xs: 24, md: 18 }, display: { xs: 'grid', md: 'none' }, placeItems: 'center' }}
        >
          <Box sx={{ width: 46, height: 5, borderRadius: 99, bgcolor: 'rgba(6,42,48,0.16)' }} />
        </ButtonBase>

        <Box sx={{ px: 2, pt: { xs: 0, md: 2.2 }, pb: 1.25 }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.3 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h3" noWrap>
                {panelTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {panelSubtitle}
              </Typography>
            </Box>
            <IconButton aria-label="Añadir lugar" onClick={() => openCreatePlace()} sx={{ bgcolor: 'secondary.light', color: 'secondary.contrastText' }}>
              <AddIcon />
            </IconButton>
            <IconButton aria-label="Ocultar panel" onClick={() => setSheetMode('hidden')} sx={{ display: { xs: 'inline-flex', md: 'none' } }}>
              <FullscreenIcon />
            </IconButton>
          </Stack>

          <Box
            role="tablist"
            aria-label="Navegación principal"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 0.6,
              p: 0.45,
              borderRadius: 999,
              bgcolor: 'rgba(8,75,67,0.06)',
            }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.value;

              return (
                <ButtonBase
                  key={item.value}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => changeTab(item.value)}
                  sx={{
                    minWidth: 0,
                    py: 0.85,
                    px: 0.6,
                    borderRadius: 999,
                    color: selected ? 'primary.dark' : 'text.secondary',
                    bgcolor: selected ? 'rgba(255,255,255,0.95)' : 'transparent',
                    boxShadow: selected ? '0 8px 18px rgba(6,42,48,0.08)' : 'none',
                    transition: 'background-color 140ms ease, box-shadow 140ms ease',
                  }}
                >
                  <Stack spacing={0.25} alignItems="center" sx={{ minWidth: 0 }}>
                    {item.value === 'inbox' ? (
                      <Badge badgeContent={inbox.length} color="primary">
                        <Icon fontSize="small" />
                      </Badge>
                    ) : (
                      <Icon fontSize="small" />
                    )}
                    <Typography variant="caption" noWrap fontWeight={selected ? 800 : 650} sx={{ fontSize: 11 }}>
                      {item.label}
                    </Typography>
                  </Stack>
                </ButtonBase>
              );
            })}
          </Box>
        </Box>

        <Box ref={panelScrollRef} sx={{ overflow: 'auto', minHeight: 0, pt: 0.5, pb: `calc(18px + env(safe-area-inset-bottom))` }}>
          {locationStatus !== 'ready' && locationError && (
            <Alert
              severity={locationStatus === 'manual' ? 'success' : 'info'}
              sx={{
                mx: 2,
                mb: 1.2,
                py: 0.55,
                borderRadius: 3,
                bgcolor: 'rgba(15,107,95,0.08)',
                color: 'text.secondary',
                '& .MuiAlert-icon': { py: 0.35, color: 'primary.main' },
                '& .MuiAlert-message': { py: 0, fontSize: 13, lineHeight: 1.35 },
              }}
            >
              {locationError}
            </Alert>
          )}
          {toast && (
            <Alert severity="success" onClose={() => setToast('')} sx={{ mx: 2, mb: 1.5, borderRadius: 3 }}>
              {toast}
            </Alert>
          )}
          {panel}
        </Box>
      </Paper>

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
