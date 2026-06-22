import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import { useTheme } from '@mui/material/styles';
import { captureDiagnostic } from '../../lib/diagnostics';

function looksLikeUrl(value) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^(www\.|maps\.|goo\.gl\/|maps\.app\.goo\.gl)/i.test(trimmed)) return true;
  return /^[^\s]+\.[^\s]{2,}/.test(trimmed);
}

export default function LinkImportDialog({ open, onClose, onImport }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isUrl = useMemo(() => looksLikeUrl(query), [query]);

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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>Importar enlace</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            Pega un enlace de Google Maps, Apple Maps, Tripadvisor o Instagram. Lo guardo en revisión para que lo confirmes antes de añadirlo.
          </Typography>
          {error && <Alert severity="warning">{error}</Alert>}
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Enlace"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setError('');
              }}
              placeholder="https://maps.apple.com/..."
              autoFocus
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={!query.trim() || loading} aria-label="Añadir enlace">
              {loading ? <CircularProgress size={22} color="inherit" /> : <LinkIcon />}
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, pb: `calc(16px + env(safe-area-inset-bottom))` }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!query.trim() || loading}>
          Añadir a revisión
        </Button>
      </DialogActions>
    </Dialog>
  );
}
