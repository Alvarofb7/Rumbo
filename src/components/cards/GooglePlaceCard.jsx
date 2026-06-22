import { Box, Button, Chip, CircularProgress, IconButton, Paper, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { CategoryBadge } from '../common/placeUtils';

export default function GooglePlaceCard({ place, loading, onClose, onSave }) {
  if (!place && !loading) return null;

  return (
    <Paper
      elevation={0}
      aria-live="polite"
      sx={{
        position: 'absolute',
        left: { xs: 12, md: 18 },
        right: { xs: 12, md: 'auto' },
        bottom: 'calc(14px + env(safe-area-inset-bottom))',
        width: { xs: 'auto', md: 388 },
        zIndex: 940,
        p: 1,
        borderRadius: '18px',
        bgcolor: 'rgba(255,255,255,0.96)',
        border: '1px solid rgba(8,75,67,0.12)',
        boxShadow: '0 22px 56px rgba(6,42,48,0.20)',
        backdropFilter: 'blur(24px)',
      }}
    >
      {loading ? (
        <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minHeight: 72, px: 0.7 }}>
          <CircularProgress size={22} />
          <Box sx={{ flex: 1 }}>
            <Typography fontWeight={850}>Cargando lugar…</Typography>
            <Typography variant="body2" color="text.secondary">
              Consultando Google Maps.
            </Typography>
          </Box>
          <IconButton size="small" aria-label="Cerrar lugar de Google" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ) : (
        <Stack spacing={0.8} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h4" noWrap>
                {place.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {place.address || place.zone || 'Lugar de Google Maps'}
              </Typography>
            </Box>
            <IconButton size="small" aria-label="Cerrar lugar de Google" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
            <CategoryBadge category={place.category} />
            <Chip size="small" label="Google Maps" color="primary" variant="outlined" />
          </Stack>

          <Stack direction="row" spacing={1} sx={{ pt: 0.2 }}>
            {place.sourceUrl && (
              <Button
                component="a"
                href={place.sourceUrl}
                target="_blank"
                rel="noreferrer"
                size="small"
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                sx={{ flex: 1 }}
              >
                Abrir en Maps
              </Button>
            )}
            <Button size="small" variant="contained" startIcon={<SaveOutlinedIcon />} onClick={() => onSave(place)} sx={{ flex: 1 }}>
              Guardar rápido
            </Button>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}
