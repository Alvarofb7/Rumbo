import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
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
};

export default function PlaceDialog({ open, place, onClose, onSave }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [draft, setDraft] = useState(blankPlace);

  useEffect(() => {
    if (open) setDraft({ ...blankPlace, ...place });
  }, [open, place]);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    if (!draft.name.trim()) return;
    onSave({
      ...draft,
      name: draft.name.trim(),
      address: draft.address.trim(),
      zone: draft.zone.trim(),
      sourceUrl: draft.sourceUrl.trim(),
      notes: draft.notes.trim(),
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>{draft.id ? 'Editar lugar' : 'Nuevo lugar'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
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
            <TextField label="Latitud" value={draft.lat} onChange={(event) => update('lat', event.target.value)} fullWidth />
            <TextField label="Longitud" value={draft.lng} onChange={(event) => update('lng', event.target.value)} fullWidth />
          </Stack>

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
