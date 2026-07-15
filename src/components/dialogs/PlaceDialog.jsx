import { useEffect, useRef, useState } from 'react';
import {
  Autocomplete,
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Rating,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LinkIcon from '@mui/icons-material/Link';
import PlaceIcon from '@mui/icons-material/Place';
import { useTheme } from '@mui/material/styles';
import { statusOptions, tagOptions } from '../../data/demoData';
import { captureDiagnostic, recordBreadcrumb } from '../../lib/diagnostics';
import { inferSourceType } from '../../lib/linkParser';
import { normalizeSupportedPlaceUrl } from '../../lib/placeUrl';
import { categoryOptions, inferPlaceCategory, normalizePlaceRating, normalizePlaceTags } from '../../lib/placeData';
import {
  createPlaceSearchSession,
  resetPlaceSearchSession,
  resolveLocationSuggestion,
  searchLocation,
} from '../../lib/googlePlaces';

const blankPlace = {
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

const formCardSx = {
  p: { xs: 1.25, sm: 1.5 },
  borderRadius: '18px',
  borderColor: 'rgba(8,75,67,0.10)',
  bgcolor: 'rgba(255,255,255,0.76)',
  overflow: 'hidden',
  maxWidth: '100%',
};

const compactFieldSx = {
  minWidth: 0,
  '& .MuiInputBase-root': {
    minWidth: 0,
    bgcolor: '#fff',
    borderRadius: '12px',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(8,75,67,0.18)',
  },
  '& .MuiFormHelperText-root': {
    mx: 1.5,
  },
};

function hasUsableCoordinates(lat, lng) {
  return lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

export function getPlaceValidationErrors(place) {
  return {
    location: hasUsableCoordinates(place?.lat, place?.lng) ? '' : 'Elige un resultado de ubicación antes de guardar.',
    name: place?.name?.trim() ? '' : 'Añade un nombre para guardar el lugar.',
  };
}

function PersonalRating({ value, onChange }) {
  const rating = normalizePlaceRating(value);

  function commitRating(nextValue) {
    const normalizedRating = normalizePlaceRating(nextValue);
    recordBreadcrumb('form.rating.changed', { value: normalizedRating });
    onChange(normalizedRating);
  }

  function handleClick(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
    commitRating(Math.min(5, Math.max(0.5, Math.ceil((offset / bounds.width) * 10) / 2)));
  }

  function handleKeyDown(event) {
    const increments = {
      ArrowLeft: -0.5,
      ArrowDown: -0.5,
      ArrowRight: 0.5,
      ArrowUp: 0.5,
    };

    if (event.key === 'Home') {
      event.preventDefault();
      commitRating(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      commitRating(5);
      return;
    }

    if (increments[event.key]) {
      event.preventDefault();
      commitRating(rating + increments[event.key]);
    }
  }

  return (
    <Stack direction="row" spacing={1.4} alignItems="center">
      <Box
        role="slider"
        tabIndex={0}
        aria-label="Ranking personal"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={rating}
        aria-valuetext={`${rating} estrellas`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        sx={{
          display: 'inline-flex',
          p: 0.75,
          mx: -0.75,
          borderRadius: '8px',
          cursor: 'pointer',
          touchAction: 'manipulation',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        <Rating
          precision={0.5}
          value={rating}
          getLabelText={(nextValue) => `${nextValue} estrellas`}
          size="large"
          readOnly
          sx={{ pointerEvents: 'none' }}
        />
      </Box>
      <Typography fontWeight={900} color="secondary.dark">
        {rating.toFixed(1).replace('.', ',')}
      </Typography>
    </Stack>
  );
}

export default function PlaceDialog({ open, place, onClose, onSave, searchBias }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [draft, setDraft] = useState(blankPlace);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationOptions, setLocationOptions] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [formErrors, setFormErrors] = useState({ location: '', name: '', sourceUrl: '' });
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const locationInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const fixedLocationQueryRef = useRef('');
  const autoFilledNameRef = useRef('');
  const locationRequestIdRef = useRef(0);
  const searchSessionRef = useRef(createPlaceSearchSession());

  useEffect(() => {
    if (open) {
      locationRequestIdRef.current += 1;
      resetPlaceSearchSession(searchSessionRef.current);
      const nextDraft = { ...blankPlace, ...place };
      nextDraft.rating = normalizePlaceRating(nextDraft.rating);
      const initialLocationQuery = nextDraft.address || nextDraft.name || '';
      const initialHasCoordinates = hasUsableCoordinates(nextDraft.lat, nextDraft.lng);

      fixedLocationQueryRef.current = initialHasCoordinates ? initialLocationQuery.trim() : '';
      autoFilledNameRef.current = '';
      setDraft(nextDraft);
      setLocationQuery(initialLocationQuery);
      setLocationOptions([]);
      setLocationLoading(false);
      setLocationError('');
      setFormErrors({ location: '', name: '', sourceUrl: '' });
      setSaving(false);
      setDetailsOpen(false);
    }
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    const requestId = ++locationRequestIdRef.current;
    const query = locationQuery.trim();
    if (query.length < 3) {
      setLocationOptions([]);
      setLocationLoading(false);
      return undefined;
    }

    if (fixedLocationQueryRef.current && query === fixedLocationQueryRef.current && hasUsableCoordinates(draft.lat, draft.lng)) {
      setLocationOptions([]);
      setLocationLoading(false);
      setLocationError('');
      return undefined;
    }

    let ignore = false;
    const timeoutId = window.setTimeout(async () => {
      if (ignore || requestId !== locationRequestIdRef.current) return;
      setLocationLoading(true);
      setLocationError('');

      try {
        const results = await searchLocation(query, {
          ...searchBias,
          session: searchSessionRef.current,
          allowTextSearch: true,
        });
        if (!ignore && requestId === locationRequestIdRef.current) setLocationOptions(results);
      } catch (error) {
        if (!ignore && requestId === locationRequestIdRef.current) {
          captureDiagnostic('search.form.suggestions', error);
          setLocationOptions([]);
          setLocationError(error.message);
        }
      } finally {
        if (!ignore && requestId === locationRequestIdRef.current) setLocationLoading(false);
      }
    }, 300);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [draft.lat, draft.lng, locationQuery, open, searchBias]);

  function update(field, value) {
    if (field === 'name') autoFilledNameRef.current = '';
    if (field === 'name' && value.trim()) setFormErrors((current) => ({ ...current, name: '' }));
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function hasSelectedLocation() {
    return hasUsableCoordinates(draft.lat, draft.lng);
  }

  function resetSelectedLocation() {
    const previousAutoFilledName = autoFilledNameRef.current;
    autoFilledNameRef.current = '';

    setDraft((current) => {
      const hadAutoFilledName = Boolean(previousAutoFilledName && current.name === previousAutoFilledName);

      if (
        !hadAutoFilledName &&
        !hasUsableCoordinates(current.lat, current.lng) &&
        !current.address &&
        !current.zone &&
        !current.providerPlaceId &&
        !current.providerType
      ) {
        return current;
      }

      return {
        ...current,
        name: hadAutoFilledName ? '' : current.name,
        address: '',
        zone: '',
        lat: '',
        lng: '',
        providerPlaceId: '',
        providerType: '',
      };
    });
  }

  async function applyLocation(result) {
    if (!result || typeof result === 'string') return;

    const requestId = ++locationRequestIdRef.current;
    setLocationLoading(true);
    setLocationError('');
    try {
      const resolved = await resolveLocationSuggestion(result, searchSessionRef.current);
      if (requestId !== locationRequestIdRef.current) return;
      const nextLocationQuery = resolved.address || resolved.name;
      fixedLocationQueryRef.current = nextLocationQuery.trim();
      setLocationOptions([]);
      setLocationQuery(nextLocationQuery);
      const previousAutoFilledName = autoFilledNameRef.current;
      const shouldTrackResolvedName = !draft.name?.trim() || draft.name === previousAutoFilledName;
      autoFilledNameRef.current = shouldTrackResolvedName ? resolved.name : '';
      setDraft((current) => {
        const shouldUseResolvedName = !current.name?.trim() || current.name === previousAutoFilledName;

        return {
          ...current,
          name: shouldUseResolvedName ? resolved.name : current.name,
          address: resolved.address || current.address,
          zone: resolved.zone || current.zone || '',
          lat: resolved.lat,
          lng: resolved.lng,
          category: resolved.category || inferPlaceCategory(resolved),
          providerPlaceId: resolved.providerPlaceId || resolved.id || '',
          providerType: resolved.providerType || resolved.type || '',
        };
      });
      setFormErrors((current) => ({ ...current, location: '', name: '' }));
    } catch (error) {
      if (requestId === locationRequestIdRef.current) {
        captureDiagnostic('search.form.resolve', error);
        setLocationError(error.message);
      }
    } finally {
      if (requestId === locationRequestIdRef.current) setLocationLoading(false);
    }
  }

  async function handleSave() {
    const nextErrors = getPlaceValidationErrors(draft);
    setFormErrors(nextErrors);
    if (nextErrors.location) {
      locationInputRef.current?.focus();
      return;
    }
    if (nextErrors.name) {
      setDetailsOpen(true);
      window.requestAnimationFrame(() => nameInputRef.current?.focus());
      return;
    }
    let sourceUrl = '';
    try { sourceUrl = draft.sourceUrl.trim() ? normalizeSupportedPlaceUrl(draft.sourceUrl) : ''; } catch (error) {
      setDetailsOpen(true);
      setFormErrors((current) => ({ ...current, sourceUrl: error.message }));
      return;
    }
    const category = inferPlaceCategory(draft);
    setSaving(true);
    try { await onSave({
      ...draft,
      name: draft.name.trim(),
      address: draft.address.trim(),
      zone: draft.zone.trim(),
      category,
      rating: normalizePlaceRating(draft.rating),
      tags: normalizePlaceTags(draft.tags, category),
      sourceType: sourceUrl ? inferSourceType(sourceUrl) : draft.sourceType || 'manual',
      sourceUrl,
      resolvedUrl: draft.resolvedUrl || '',
    }); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ px: { xs: 2.25, sm: 3 }, pt: { xs: 'calc(16px + env(safe-area-inset-top))', sm: 2 }, pb: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Typography variant="h3">{draft.id ? 'Editar lugar' : 'Guardar lugar'}</Typography>
            <Typography variant="body2" color="text.secondary">
              Busca el sitio y guarda sólo lo que te importe.
            </Typography>
          </Box>
          <IconButton aria-label="Cerrar formulario" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          bgcolor: 'rgba(247,244,237,0.55)',
          px: { xs: 2.25, sm: 3 },
          overflowX: 'hidden',
        }}
      >
        <Stack spacing={1.6} sx={{ pt: 1 }}>
          <Paper variant="outlined" sx={formCardSx}>
            <Stack spacing={1.2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <PlaceIcon color={hasSelectedLocation() ? 'success' : 'primary'} />
                <Box>
                  <Typography fontWeight={850}>Ubicación</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Busca por nombre o dirección. El mapa se ajusta solo.
                  </Typography>
                </Box>
              </Stack>

              <Autocomplete
                filterOptions={(options) => options}
                options={locationOptions}
                getOptionKey={(option) => (typeof option === 'string' ? option : option.id || `${option.name}-${option.lat}-${option.lng}`)}
                getOptionLabel={(option) => (typeof option === 'string' ? option : `${option.name} · ${option.address}`)}
                renderOption={(props, option) => {
                  const { key: _key, ...optionProps } = props;
                  const optionKey = option.id || `${option.name}-${option.lat}-${option.lng}`;

                  return (
                    <Box component="li" key={optionKey} {...optionProps}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={800} noWrap>
                          {option.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {option.address}
                        </Typography>
                      </Box>
                    </Box>
                  );
                }}
                inputValue={locationQuery}
                onInputChange={(_, value, reason) => {
                  if (reason === 'reset' || reason === 'selectOption') return;
                  if (reason === 'input' || reason === 'clear') {
                    fixedLocationQueryRef.current = '';
                    resetSelectedLocation();
                  }
                  setLocationQuery(value);
                }}
                onChange={(_, value) => void applyLocation(value)}
                loading={locationLoading && !hasSelectedLocation()}
                noOptionsText={locationQuery.trim().length < 3 ? 'Escribe al menos 3 caracteres' : 'Sin resultados'}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    inputRef={locationInputRef}
                    label="Buscar sitio"
                    placeholder="Nombre del bar o dirección"
                    error={Boolean(formErrors.location)}
                    helperText={formErrors.location || (hasSelectedLocation() ? draft.address : 'Elige un resultado para fijarlo en el mapa.')}
                    sx={compactFieldSx}
                  />
                )}
              />

              {locationLoading && !hasSelectedLocation() && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    Buscando lugares...
                  </Typography>
                </Stack>
              )}
              {locationError && <Alert severity="warning">{locationError}</Alert>}
              {hasSelectedLocation() && (
                <Alert severity="success" sx={{ py: 0.5 }}>
                  Sitio localizado correctamente.
                </Alert>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={formCardSx}>
            <Stack spacing={1.4}>
              <TextField
                select
                label="Formato del sitio"
                value={draft.category || 'other'}
                onChange={(event) => update('category', event.target.value)}
                helperText="Bar, restaurante o cafetería. Cocina, precio y plan van en etiquetas."
                fullWidth
                sx={compactFieldSx}
              >
                {categoryOptions.map((category) => (
                  <MenuItem key={category.value} value={category.value}>
                    {category.label}
                  </MenuItem>
                ))}
              </TextField>

              <Box>
                <Typography fontWeight={850} sx={{ mb: 0.8 }}>
                  Estado
                </Typography>
                <Stack role="radiogroup" aria-label="Estado del lugar" direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ '& .MuiButton-root': { minWidth: 0 } }}>
                  {statusOptions
                    .filter((status) => status.value !== 'discarded')
                    .map((status) => {
                      const selected = draft.status === status.value;
                      return (
                        <Button
                          key={status.value}
                          role="radio"
                          aria-checked={selected}
                          variant={selected ? 'contained' : 'outlined'}
                          onClick={() => update('status', status.value)}
                          sx={{
                            minHeight: 44,
                            px: 1.4,
                            bgcolor: selected ? status.color : 'transparent',
                            borderColor: `${status.color}55`,
                            color: selected ? '#fff' : status.color,
                            '&:hover': { bgcolor: selected ? status.color : `${status.color}10` },
                          }}
                        >
                          {status.label}
                        </Button>
                      );
                    })}
                </Stack>
              </Box>

              <Box>
                <Typography fontWeight={850} sx={{ mb: 0.5 }}>
                  Ranking personal
                </Typography>
                <PersonalRating value={draft.rating} onChange={(value) => update('rating', value)} />
              </Box>

              <Autocomplete
                multiple
                freeSolo
                options={tagOptions}
                value={draft.tags || []}
                onChange={(_, value) => update('tags', value)}
                sx={{ minWidth: 0 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Cocina, precio y plan"
                    placeholder="Sushi, carne, cita, barato..."
                    helperText="Combina varias o escribe una nueva."
                    sx={compactFieldSx}
                  />
                )}
              />
            </Stack>
          </Paper>

          <Button
            variant="text"
            onClick={() => setDetailsOpen((current) => !current)}
            endIcon={<ExpandMoreIcon sx={{ transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />}
            sx={{ alignSelf: 'flex-start' }}
          >
            Más detalles
          </Button>

          <Collapse in={detailsOpen} unmountOnExit>
            <Paper variant="outlined" sx={formCardSx}>
              <Stack spacing={1.4}>
                <TextField
                  inputRef={nameInputRef}
                  label="Nombre"
                  value={draft.name}
                  onChange={(event) => update('name', event.target.value)}
                  required
                  error={Boolean(formErrors.name)}
                  helperText={formErrors.name}
                  fullWidth
                  sx={compactFieldSx}
                />
                <TextField label="Zona o barrio" value={draft.zone} onChange={(event) => update('zone', event.target.value)} fullWidth sx={compactFieldSx} />
                <Stack direction="row" spacing={1} alignItems="center">
                  <LinkIcon color="primary" />
                  <Typography fontWeight={850}>Enlace original</Typography>
                </Stack>
                <TextField
                  label="Maps, Tripadvisor o Instagram"
                  value={draft.sourceUrl}
                  onChange={(event) => { update('sourceUrl', event.target.value); setFormErrors((current) => ({ ...current, sourceUrl: '' })); }}
                  error={Boolean(formErrors.sourceUrl)}
                  helperText={formErrors.sourceUrl}
                  fullWidth
                  sx={compactFieldSx}
                />
              </Stack>
            </Paper>
          </Collapse>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2.25, sm: 3 }, py: 2, pb: `calc(16px + env(safe-area-inset-bottom))` }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          Guardar lugar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
