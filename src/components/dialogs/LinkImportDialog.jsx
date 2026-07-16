import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';
import { captureDiagnostic } from '../../lib/diagnostics';
import { applyPreviewCoordinates, canConfirmImportPreview, updateImportPreview } from '../../lib/placeImporter';
import { isSafeSupportedPlaceUrl } from '../../lib/placeUrl';
import { createPlaceSearchSession, resolveLocationSuggestion, searchLocation } from '../../lib/googlePlaces';

export function getPreviewDialogStatus(preview = {}) {
  const provenance = { official_api: 'API oficial', metadata: 'Metadatos', geocoder: 'Geocodificador', local_parser: 'Análisis local', place_search: 'Búsqueda de lugar' }[preview.quality?.provenance] || 'Proveniencia desconocida';
  const quality = { exact: 'coordenadas exactas', geocoded: 'coordenadas geocodificadas', approximate: 'coordenadas aproximadas', missing: 'sin coordenadas' }[preview.quality?.coordinateQuality] || 'sin coordenadas';
  const confidence = { high: 'alta', medium: 'media', low: 'baja' }[preview.quality?.confidence] || 'baja';
  return { label: `${provenance} · confianza ${confidence} · ${quality}`, confirmDisabled: !canConfirmImportPreview(preview).allowed };
}

export function createPreviewConfirmation(onConfirm) {
  let pending = false;
  return async (preview) => {
    if (pending) return false;
    pending = true;
    try { await onConfirm(preview); return true; } finally { pending = false; }
  };
}

export default function LinkImportDialog({ open, onClose, onImport, onConfirm, onRecomputeDuplicate = () => null }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [expiresAt, setExpiresAt] = useState(0);
  const confirmationRef = useRef(null);
  const locationSessionRef = useRef(createPlaceSearchSession());
  const isUrl = useMemo(() => isSafeSupportedPlaceUrl(query), [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setError('');
      setLoading(false);
      setPreview(null);
      setLocationQuery('');
      setLocationResults([]);
      setExpiresAt(0);
      confirmationRef.current = null;
    }
  }, [open]);

  async function handleSubmit(event) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setError('');

    if (!isUrl) {
      setError('Pega un enlace válido de Maps, Tripadvisor o Instagram.');
      return;
    }

    setLoading(true);

    try {
      const importedPreview = await onImport(trimmed);
      setPreview(importedPreview);
      setExpiresAt(importedPreview.expiresAt || Date.now() + 15 * 60 * 1000);
      setQuery('');
    } catch (actionError) {
      captureDiagnostic('link.import', actionError);
      setError(actionError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(event) {
    event?.preventDefault();
    if (!preview || !onConfirm) return;
    if (expiresAt && Date.now() >= expiresAt) {
      setError('La vista previa ha caducado. Analiza el enlace de nuevo.');
      setPreview(null);
      return;
    }
    const gate = canConfirmImportPreview(preview);
    if (!gate.allowed) { setError('Completa los requisitos indicados antes de enviar a revisión.'); return; }
    if (!confirmationRef.current) confirmationRef.current = createPreviewConfirmation(onConfirm);
    setLoading(true);
    try { if (await confirmationRef.current(preview)) onClose(); } catch (actionError) { setError(actionError.message || 'No se pudo enviar a revisión.'); } finally { setLoading(false); }
  }

  async function searchPreviewLocation() {
    try { setLocationResults(await searchLocation(locationQuery, { session: locationSessionRef.current, allowTextSearch: true })); } catch (searchError) { setError(searchError.message); }
  }

  async function selectPreviewLocation(result) {
    try {
      const correctedPreview = applyPreviewCoordinates(preview, await resolveLocationSuggestion(result, locationSessionRef.current));
      setPreview({ ...correctedPreview, duplicate: onRecomputeDuplicate(correctedPreview) || correctedPreview.duplicate });
      setLocationResults([]);
    } catch (selectionError) { setError(selectionError.message); }
  }

  function updatePreview(changes) {
    const updatedPreview = updateImportPreview(preview, changes);
    setPreview({ ...updatedPreview, duplicate: onRecomputeDuplicate(updatedPreview) || updatedPreview.duplicate });
  }

  function discardPreview() {
    setPreview(null);
    setLocationQuery('');
    setLocationResults([]);
    setExpiresAt(0);
    setError('');
  }

  const status = preview ? getPreviewDialogStatus(preview) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: isMobile
            ? {
                m: 0,
                width: '100%',
                maxWidth: 'none',
                maxHeight: 'min(78dvh, 620px)',
                alignSelf: 'flex-end',
                borderRadius: '24px 24px 0 0',
              }
            : { borderRadius: '22px' },
        },
      }}
    >
      <Box component="form" onSubmit={preview ? handleConfirm : handleSubmit}>
        <DialogTitle sx={{ px: { xs: 2, sm: 3 }, pt: 2, pb: 1 }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '14px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(15,107,95,0.10)',
                color: 'primary.main',
              }}
            >
              <LinkIcon />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h3">Añadir enlace</Typography>
              <Typography variant="body2" color="text.secondary">
                Se guardará en Revisión antes de añadirlo al mapa
              </Typography>
            </Box>
            <IconButton aria-label="Cerrar" onClick={onClose} disabled={loading} sx={{ mr: -0.75 }}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 1.5, pb: 1 }}>
          <Stack spacing={1.5}>
            {error && <Alert severity="warning">{error}</Alert>}
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: '18px', borderColor: 'rgba(15,107,95,0.16)' }}>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Pega el enlace que quieras guardar para revisarlo después.
                </Typography>
                {!preview && <TextField
                  label="Enlace"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setError('');
                  }}
                  placeholder="https://maps.app.goo.gl/..."
                  autoFocus
                  fullWidth
                  inputProps={{ inputMode: 'url', autoCapitalize: 'none', autoCorrect: 'off' }}
                />}
                {preview && <Stack spacing={1}>
                  <Typography variant="subtitle2">Vista previa</Typography>
                  <Typography variant="body2" color="text.secondary">{status.label}</Typography>
                  <TextField label="Nombre" value={preview.place.title} onChange={(event) => updatePreview({ title: event.target.value })} fullWidth />
                  <TextField label="Dirección" value={preview.place.address} onChange={(event) => updatePreview({ address: event.target.value })} fullWidth />
                  <TextField label="Zona" value={preview.place.zone} onChange={(event) => updatePreview({ zone: event.target.value })} fullWidth />
                  <TextField label="Categoría" value={preview.place.category} onChange={(event) => updatePreview({ category: event.target.value })} fullWidth />
                  <TextField label="Etiquetas (separadas por comas)" value={preview.place.tags.join(', ')} onChange={(event) => updatePreview({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} fullWidth />
                  <TextField label="Valoración" type="number" value={preview.place.rating} onChange={(event) => updatePreview({ rating: Number(event.target.value) })} inputProps={{ min: 0, max: 5, step: 0.5 }} fullWidth />
                  <Stack spacing={0.5}><Alert severity={preview.quality.coordinateQuality === 'missing' ? 'warning' : 'info'}>{preview.quality.coordinateQuality === 'missing' ? 'Faltan coordenadas. Busca y selecciona el lugar para corregirlas.' : '¿Las coordenadas no son correctas? Busca y selecciona el lugar para corregirlas.'}</Alert><TextField label="Buscar ubicación" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchPreviewLocation(); } }} fullWidth />{locationResults.map((result) => <Button key={result.id} variant="text" onClick={() => void selectPreviewLocation(result)}>{result.name}{result.address ? ` · ${result.address}` : ''}</Button>)}</Stack>
                  {preview.quality.warnings.map((warning) => ['AMBIGUOUS_MATCH', 'APPROXIMATE_COORDINATES'].includes(warning) ? <FormControlLabel key={warning} control={<Checkbox checked={preview.acknowledgedWarnings?.includes(warning) || false} onChange={(event) => setPreview({ ...preview, acknowledgedWarnings: event.target.checked ? [...(preview.acknowledgedWarnings || []), warning] : (preview.acknowledgedWarnings || []).filter((item) => item !== warning) })} />} label={warning === 'AMBIGUOUS_MATCH' ? 'Confirmo que la coincidencia puede ser ambigua.' : 'Acepto que las coordenadas son aproximadas.'} /> : <Alert key={warning} severity="info">{warning}</Alert>)}
                  {preview.quality.ambiguity && <Alert severity="warning">Coincidencia ambigua</Alert>}
                  <Alert severity={preview.duplicate.status === 'none' ? 'success' : preview.duplicate.status === 'probable' ? 'error' : 'warning'}>{preview.duplicate.status === 'none' ? 'Sin duplicados detectados.' : `Posible duplicado en ${preview.duplicate.matchedCollection === 'saved' ? 'lugares guardados' : 'revisión'}.`}</Alert>
                </Stack>}
              </Stack>
            </Paper>

            <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap">
              {['Google Maps', 'Apple Maps', 'Tripadvisor', 'Instagram'].map((source) => (
                <Chip
                  key={source}
                  label={source}
                  size="small"
                  variant="outlined"
                  sx={{ color: 'text.secondary', borderColor: 'rgba(6,42,48,0.10)' }}
                />
              ))}
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pt: 1, pb: `calc(16px + env(safe-area-inset-bottom))` }}>
          {preview && <Button type="button" onClick={discardPreview} disabled={loading}>Descartar</Button>}
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading || (preview ? status.confirmDisabled : !query.trim())}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LinkIcon />}
          >
            {loading ? (preview ? 'Enviando a revisión…' : 'Analizando…') : preview ? 'Enviar a revisión' : 'Analizar enlace'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
