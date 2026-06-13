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
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import { searchLocation } from '../../lib/geo';

function looksLikeUrl(value) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^(www\.|maps\.|goo\.gl\/|maps\.app\.goo\.gl)/i.test(trimmed)) return true;
  return /^[^\s]+\.[^\s]{2,}/.test(trimmed);
}

export default function LinkImportDialog({ open, onClose, onImport, onSearchSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isUrl = useMemo(() => looksLikeUrl(query), [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setError('');
      setLoading(false);
    }
  }, [open]);

  async function handleSubmit(event) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setError('');
    setLoading(true);

    try {
      if (isUrl) {
        await onImport(trimmed);
        setQuery('');
        setResults([]);
        return;
      }

      const nextResults = await searchLocation(trimmed);
      setResults(nextResults);
      if (!nextResults.length) setError('No he encontrado nada con esa búsqueda.');
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(result) {
    onSearchSelect(result);
    setQuery('');
    setResults([]);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Buscar o pegar enlace</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            Busca una ciudad, barrio, dirección o lugar. Si pegas un enlace de Google Maps, Apple Maps, Tripadvisor o Instagram,
            lo guardo en la bandeja para revisarlo después.
          </Typography>
          {error && <Alert severity="warning">{error}</Alert>}
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Lugar, dirección o enlace"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResults([]);
                setError('');
              }}
              placeholder="Casa Dani Madrid o https://maps.apple.com/..."
              autoFocus
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={!query.trim() || loading} aria-label={isUrl ? 'Añadir enlace' : 'Buscar'}>
              {loading ? <CircularProgress size={22} color="inherit" /> : isUrl ? <LinkIcon /> : <SearchIcon />}
            </Button>
          </Box>
          <List disablePadding>
            {results.map((result, index) => (
              <Box key={result.id}>
                {index > 0 && <Divider />}
                <ListItemButton onClick={() => handleSelect(result)}>
                  <ListItemText primary={result.name} secondary={result.address} />
                </ListItemButton>
              </Box>
            ))}
          </List>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!query.trim() || loading}>
          {isUrl ? 'Añadir enlace' : 'Buscar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
