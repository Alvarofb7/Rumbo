import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, Divider, List, ListItemButton, ListItemText, Stack, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { searchLocation } from '../../lib/geo';

export default function SearchDialog({ open, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(event) {
    event?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const nextResults = await searchLocation(query);
      setResults(nextResults);
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(result) {
    onSelect(result);
    setQuery('');
    setResults([]);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Buscar ubicación</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="warning">{error}</Alert>}
          <Box component="form" onSubmit={handleSearch} sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Ciudad, barrio o dirección"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={!query.trim() || loading} aria-label="Buscar">
              {loading ? <CircularProgress size={22} color="inherit" /> : <SearchIcon />}
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
    </Dialog>
  );
}
