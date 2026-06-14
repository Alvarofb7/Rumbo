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
  IconButton,
  Paper,
  Rating,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import PlaceIcon from '@mui/icons-material/Place';
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
  imageUrl: '',
};

const formCardSx = {
  p: { xs: 1.25, sm: 1.5 },
  borderRadius: '26px',
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
    borderRadius: '18px',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(8,75,67,0.18)',
  },
  '& .MuiFormHelperText-root': {
    mx: 1.5,
  },
};

function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Elige un archivo de imagen.'));
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const maxSide = 1200;
      const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('No he podido preparar la foto.'));
            return;
          }

          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('No he podido leer la foto.'));
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.78,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No he podido abrir la imagen.'));
    };
    image.src = objectUrl;
  });
}

export default function PlaceDialog({ open, place, onClose, onSave, searchBias }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [draft, setDraft] = useState(blankPlace);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationOptions, setLocationOptions] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');

  useEffect(() => {
    if (open) {
      const nextDraft = { ...blankPlace, ...place };
      setDraft(nextDraft);
      setLocationQuery(nextDraft.address || nextDraft.name || '');
      setLocationOptions([]);
      setLocationError('');
      setPhotoError('');
      setPhotoLoading(false);
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
        const results = await searchLocation(query, searchBias);
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
  }, [locationQuery, open, searchBias]);

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

  async function handlePhotoFile(event) {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;

    setPhotoError('');
    setPhotoLoading(true);
    try {
      const imageUrl = await compressImageFile(file);
      update('imageUrl', imageUrl);
    } catch (error) {
      setPhotoError(error.message);
    } finally {
      setPhotoLoading(false);
    }
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
      notes: draft.notes?.trim?.() || '',
      imageUrl: draft.imageUrl?.trim?.() || '',
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ px: { xs: 2.25, sm: 3 }, pb: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Typography variant="h3">{draft.id ? 'Editar lugar' : 'Guardar lugar'}</Typography>
            <Typography variant="body2" color="text.secondary">
              Primero fija el sitio; después añade tu ranking y foto.
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
                getOptionLabel={(option) => (typeof option === 'string' ? option : `${option.name} · ${option.address}`)}
                inputValue={locationQuery}
                onInputChange={(_, value) => setLocationQuery(value)}
                onChange={(_, value) => applyLocation(value)}
                loading={locationLoading}
                noOptionsText={locationQuery.trim().length < 3 ? 'Escribe al menos 3 caracteres' : 'Sin resultados'}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Buscar sitio"
                    placeholder="Ojalá Tapas Sevilla"
                    helperText={hasSelectedLocation() ? draft.address : 'Elige un resultado para fijarlo en el mapa.'}
                    sx={compactFieldSx}
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
                <Alert severity="success" sx={{ py: 0.5 }}>
                  Sitio localizado correctamente.
                </Alert>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={formCardSx}>
            <Stack spacing={1.4}>
              <TextField label="Nombre" value={draft.name} onChange={(event) => update('name', event.target.value)} required fullWidth sx={compactFieldSx} />
              <TextField label="Zona o barrio" value={draft.zone} onChange={(event) => update('zone', event.target.value)} fullWidth sx={compactFieldSx} />

              <Box>
                <Typography fontWeight={850} sx={{ mb: 0.8 }}>
                  Estado
                </Typography>
                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ '& .MuiButton-root': { minWidth: 0 } }}>
                  {statusOptions
                    .filter((status) => status.value !== 'discarded')
                    .map((status) => {
                      const selected = draft.status === status.value;
                      return (
                        <Button
                          key={status.value}
                          variant={selected ? 'contained' : 'outlined'}
                          onClick={() => update('status', status.value)}
                          sx={{
                            minHeight: 38,
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
                <Stack direction="row" spacing={1.4} alignItems="center">
                  <Rating
                    precision={0.5}
                    value={Number(draft.rating || 0)}
                    onChange={(_, value) => update('rating', value || 0)}
                    getLabelText={(value) => `${value} estrellas`}
                    size="large"
                  />
                  <Typography fontWeight={900} color="secondary.dark">
                    {Number(draft.rating || 0).toFixed(1)}
                  </Typography>
                </Stack>
              </Box>

              <Autocomplete
                multiple
                freeSolo
                options={tagOptions}
                value={draft.tags || []}
                onChange={(_, value) => update('tags', value)}
                sx={{ minWidth: 0 }}
                renderInput={(params) => <TextField {...params} label="Etiquetas" placeholder="Bar, terraza, cita..." sx={compactFieldSx} />}
              />
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={formCardSx}>
            <Stack spacing={1.2}>
              <Typography fontWeight={850}>Foto</Typography>
              {draft.imageUrl ? (
                <Box sx={{ position: 'relative' }}>
                  <Box
                    component="img"
                    src={draft.imageUrl}
                    alt=""
                    sx={{ width: '100%', height: 172, objectFit: 'cover', borderRadius: 3, bgcolor: 'primary.light' }}
                  />
                  <IconButton
                    aria-label="Quitar foto"
                    onClick={() => update('imageUrl', '')}
                    sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.9)' }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Box>
              ) : (
                <Button component="label" variant="outlined" startIcon={<AddPhotoAlternateIcon />} disabled={photoLoading}>
                  {photoLoading ? 'Preparando foto...' : 'Añadir foto'}
                  <input hidden accept="image/*" type="file" onChange={handlePhotoFile} />
                </Button>
              )}
              {photoError && <Alert severity="warning">{photoError}</Alert>}
              <TextField
                label="O pega una URL de imagen"
                value={draft.imageUrl?.startsWith('data:') ? '' : draft.imageUrl || ''}
                onChange={(event) => update('imageUrl', event.target.value)}
                placeholder="https://..."
                fullWidth
                sx={compactFieldSx}
              />
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={formCardSx}>
            <Stack spacing={1.2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <LinkIcon color="primary" />
                <Box>
                  <Typography fontWeight={850}>Referencia</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Opcional: enlace original de Maps, Tripadvisor o Instagram.
                  </Typography>
                </Box>
              </Stack>

              <TextField label="Enlace original" value={draft.sourceUrl} onChange={(event) => update('sourceUrl', event.target.value)} fullWidth sx={compactFieldSx} />

              <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ '& .MuiButton-root': { minWidth: 0 } }}>
                {Object.entries(sourceMeta).map(([value, meta]) => {
                  const selected = draft.sourceType === value;
                  return (
                    <Button
                      key={value}
                      size="small"
                      variant={selected ? 'contained' : 'outlined'}
                      onClick={() => update('sourceType', value)}
                      sx={{
                        minHeight: 34,
                        bgcolor: selected ? meta.color : 'transparent',
                        borderColor: `${meta.color}55`,
                        color: selected ? '#fff' : meta.color,
                        '&:hover': { bgcolor: selected ? meta.color : `${meta.color}10` },
                      }}
                    >
                      {meta.label}
                    </Button>
                  );
                })}
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2.25, sm: 3 }, py: 2, pb: `calc(16px + env(safe-area-inset-bottom))` }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave} disabled={!draft.name.trim() || photoLoading}>
          Guardar lugar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
