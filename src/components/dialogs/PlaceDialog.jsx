import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { sourceMeta, statusOptions, tagOptions } from '../../data/demoData';
import { searchLocation } from '../../lib/geo';

const blankPlace = {
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

export default function PlaceDialog({ open, place, onClose, onSave }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [draft, setDraft] = useState(blankPlace);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationOptions, setLocationOptions] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    if (open) {
      const nextDraft = { ...blankPlace, ...place };
      setDraft(nextDraft);
      setLocationQuery(nextDraft.address || nextDraft.name || '');
      setLocationOptions([]);
      setLocationError('');
    }
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    const query = locationQuery.trim();
    if (query.length < 3) {
      setLocationOptions([]);
      setLocationLoading(false);
      return undefined;
    }

    let ignore = false;
    const timeoutId = window.setTimeout(async () => {
      setLocationLoading(true);
      setLocationError('');

      try {
        const results = await searchLocation(query);
        if (!ignore) setLocationOptions(results);
      } catch (error) {
        if (!ignore) {
          setLocationOptions([]);
          setLocationError(error.message);
        }
      } finally {
        if (!ignore) setLocationLoading(false);
      }
    }, 450);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [locationQuery, open]);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function hasSelectedLocation() {
    return draft.lat !== '' && draft.lng !== '' && Number.isFinite(Number(draft.lat)) && Number.isFinite(Number(draft.lng));
  }

  function applyLocation(result) {
    if (!result || typeof result === 'string') return;

    setDraft((current) => ({
      ...current,
      name: current.name?.trim() ? current.name : result.name,
      address: result.address || current.address,
      zone: current.zone || result.zone || '',
      lat: result.lat,
      lng: result.lng,
    }));
    setLocationQuery(result.address || result.name);
    setLocationOptions([]);
  }

  function handleSave() {
    if (!draft.name.trim()) return;
    onSave({
      ...draft,
      name: draft.name.trim(),
      address: draft.address.trim(),
      zone: draft.zone.trim(),
      sourceUrl: draft.sourceUrl.trim(),
      resolvedUrl: draft.resolvedUrl || '',
      notes: draft.notes.trim(),
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>{draft.id ? 'Editar lugar' : 'Nuevo lugar'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Autocomplete
            filterOptions={(options) => options}
            options={locationOptions}
            getOptionLabel={(option) => (typeof option === 'string' ? option : `${option.name} · ${option.address}`)}
            inputValue={locationQuery}
            onInputChange={(_, value) => setLocationQuery(value)}
            onChange={(_, value) => applyLocation(value)}
            loading={locationLoading}
            noOptionsText={locationQuery.trim().length < 3 ? 'Escribe al menos 3 caracteres' : 'Sin resultados'}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Buscar sitio en el mapa"
                placeholder="Nombre, dirección, barrio..."
                helperText="Elige un resultado para fijar el punto exacto en el mapa."
              />
            )}
          />

          {locationLoading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Buscando lugares...
              </Typography>
            </Stack>
          )}
          {locationError && <Alert severity="warning">{locationError}</Alert>}
          {hasSelectedLocation() && (
            <Alert severity="success">
              Ubicación seleccionada: {draft.address || `${Number(draft.lat).toFixed(5)}, ${Number(draft.lng).toFixed(5)}`}
            </Alert>
          )}

          <TextField label="Nombre" value={draft.name} onChange={(event) => update('name', event.target.value)} required fullWidth />
          <TextField label="Dirección" value={draft.address} onChange={(event) => update('address', event.target.value)} fullWidth />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField label="Zona o barrio" value={draft.zone} onChange={(event) => update('zone', event.target.value)} fullWidth />
            <FormControl fullWidth>
              <InputLabel>Estado</InputLabel>
              <Select label="Estado" value={draft.status} onChange={(event) => update('status', event.target.value)}>
                {statusOptions.map((status) => (
                  <MenuItem key={status.value} value={status.value}>
                    {status.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Autocomplete
            multiple
            freeSolo
            options={tagOptions}
            value={draft.tags || []}
            onChange={(_, value) => update('tags', value)}
            renderInput={(params) => <TextField {...params} label="Etiquetas" placeholder="Bar, restaurante, cita..." />}
          />

          <Box>
            <Typography fontWeight={700}>Ranking personal</Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Slider
                min={0}
                max={5}
                step={0.1}
                value={Number(draft.rating || 0)}
                onChange={(_, value) => update('rating', value)}
                valueLabelDisplay="auto"
              />
              <Typography fontWeight={800} sx={{ width: 38, textAlign: 'right' }}>
                {Number(draft.rating || 0).toFixed(1)}
              </Typography>
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <FormControl fullWidth>
              <InputLabel>Origen</InputLabel>
              <Select label="Origen" value={draft.sourceType} onChange={(event) => update('sourceType', event.target.value)}>
                {Object.entries(sourceMeta).map(([value, meta]) => (
                  <MenuItem key={value} value={value}>
                    {meta.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Enlace original" value={draft.sourceUrl} onChange={(event) => update('sourceUrl', event.target.value)} fullWidth />
          </Stack>

          <TextField
            label="Notas"
            value={draft.notes}
            onChange={(event) => update('notes', event.target.value)}
            multiline
            minRows={3}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, pb: `calc(16px + env(safe-area-inset-bottom))` }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave} disabled={!draft.name.trim()}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
