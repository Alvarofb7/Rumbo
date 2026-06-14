import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
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
import SearchIcon from '@mui/icons-material/Search';
import { searchLocation } from '../../lib/geo';

export default function SearchDialog({ open, onClose, onSelect, searchBias }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setLoading(false);
      setError('');
    }
  }, [open]);

  async function handleSearch(event) {
    event?.preventDefault();
    if (!query.trim()) return;

    setError('');
    setLoading(true);
    try {
      const nextResults = await searchLocation(query, searchBias);
      setResults(nextResults);
      if (!nextResults.length) setError('No he encontrado esa ubicación.');
    } catch (searchError) {
      setResults([]);
      setError(searchError.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(result) {
    setLoading(false);
    setError('');
    onSelect(result);
    setQuery('');
    setResults([]);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Buscar en el mapa</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            Mueve el mapa a una ciudad, barrio, dirección o restaurante. Para guardar enlaces, usa “Revisar enlaces”.
          </Typography>
          {error && <Alert severity="warning">{error}</Alert>}
          <Box component="form" onSubmit={handleSearch} sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Lugar para centrar el mapa"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResults([]);
                setError('');
              }}
              placeholder="Seis Tapas Sevilla"
              autoFocus
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={!query.trim() || loading} aria-label="Buscar">
              {loading ? <CircularProgress size={22} color="inherit" /> : <SearchIcon />}
            </Button>
          </Box>
          <List disablePadding>
            {results.map((result, index) => (
              <Box key={`${result.id || `${result.name}-${result.lat}-${result.lng}`}-${index}`}>
                {index > 0 && <Divider />}
                <ListItemButton onClick={() => handleSelect(result)}>
                  <ListItemText primary={result.name} secondary={result.address} />
                </ListItemButton>
              </Box>
            ))}
          </List>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
