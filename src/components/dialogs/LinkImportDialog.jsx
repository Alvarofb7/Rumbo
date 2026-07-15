import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { isSafeSupportedPlaceUrl } from '../../lib/placeUrl';

export default function LinkImportDialog({ open, onClose, onImport }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isUrl = useMemo(() => isSafeSupportedPlaceUrl(query), [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setError('');
      setLoading(false);
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
      await onImport(trimmed);
      setQuery('');
    } catch (actionError) {
      captureDiagnostic('link.import', actionError);
      setError(actionError.message);
    } finally {
      setLoading(false);
    }
  }

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
      <Box component="form" onSubmit={handleSubmit}>
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
                <TextField
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
                />
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
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={!query.trim() || loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LinkIcon />}
          >
            {loading ? 'Analizando…' : 'Añadir a revisión'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
