import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';

export default function LinkImportDialog({ open, onClose, onImport }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  async function handleImport() {
    setError('');
    try {
      await onImport(url);
      setUrl('');
    } catch (importError) {
      setError(importError.message);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Pegar enlace</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            Funciona con enlaces de Google Maps, Apple Maps, Tripadvisor, Instagram y URLs normales. Si no hay coordenadas,
            Rumbo lo deja en tu zona actual para que lo ajustes.
          </Typography>
          {error && <Alert severity="warning">{error}</Alert>}
          <TextField
            label="Enlace"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://maps.google.com/..."
            multiline
            minRows={3}
            autoFocus
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleImport} disabled={!url.trim()}>
          Añadir a bandeja
        </Button>
      </DialogActions>
    </Dialog>
  );
}
