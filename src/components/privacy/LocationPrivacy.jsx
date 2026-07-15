import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';

export function LocationConsentDialog({ open, onClose, onEnable }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Usar tu ubicación</DialogTitle>
      <DialogContent>
        <Stack spacing={1.2}>
          <Typography>
            Rumbo usa tu ubicación para ordenar lugares cercanos y mejorar la relevancia de Google Places.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No guardamos tus coordenadas. Solo recordamos si activaste esta función. Vercel Analytics y Speed Insights recogen métricas de uso y rendimiento.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Ahora no</Button>
        <Button variant="contained" onClick={onEnable}>Activar ubicación</Button>
      </DialogActions>
    </Dialog>
  );
}

export function LocationPrivacySettings({ consent, status, onEnable, onDisable }) {
  const enabled = consent === true;
  return (
    <Alert severity="info" icon={<LocationOnIcon />} sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={1}>
        <Box>
          <Typography fontWeight={850}>Privacidad y ubicación</Typography>
          <Typography variant="body2">
            {enabled
              ? 'La ubicación está activa para cercanía y Google Places.'
              : 'La ubicación está desactivada. Google Places usa la zona visible del mapa.'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Vercel Analytics y Speed Insights miden uso y rendimiento. No guardamos tus coordenadas.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={enabled ? onDisable : onEnable} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
          {enabled ? 'Desactivar ubicación' : 'Activar ubicación'}
        </Button>
        {status === 'insecure' && <Typography variant="caption">La ubicación necesita HTTPS.</Typography>}
      </Stack>
    </Alert>
  );
}
