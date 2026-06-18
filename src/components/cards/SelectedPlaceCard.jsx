import { Box, Button, Chip, IconButton, Paper, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import NearMeIcon from '@mui/icons-material/NearMe';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { sourceMeta } from '../../data/demoData';
import { formatDistance } from '../../lib/geo';
import { CategoryBadge, getStatusMeta, RatingText, TagList } from '../common/placeUtils';

export default function SelectedPlaceCard({ place, onClose, onDirections, onEdit }) {
  if (!place) return null;
  const statusMeta = getStatusMeta(place.status);
  const source = sourceMeta[place.sourceType] || sourceMeta.manual;

  return (
    <Paper
      elevation={0}
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
      <Stack spacing={0.65} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h4" noWrap>
                {place.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {place.address || place.zone || formatDistance(place.distance)}
              </Typography>
            </Box>
            <IconButton size="small" aria-label="Cerrar lugar" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
            <RatingText rating={place.rating} />
            <CategoryBadge category={place.category} />
            <Chip size="small" label={statusMeta.label} sx={{ color: statusMeta.color, bgcolor: `${statusMeta.color}14`, fontWeight: 750 }} />
          </Stack>
          <TagList tags={place.tags} limit={3} />

          {place.sourceUrl && (
            <Button
              component="a"
              href={place.sourceUrl}
              target="_blank"
              rel="noreferrer"
              size="small"
              startIcon={<OpenInNewIcon />}
              sx={{ alignSelf: 'flex-start', minHeight: 30, px: 0.5 }}
            >
              Abrir en {source.label}
            </Button>
          )}

          <Stack direction="row" spacing={1} sx={{ pt: 0.3 }}>
            <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => onEdit(place)} sx={{ flex: 1 }}>
              Editar
            </Button>
            <Button size="small" variant="contained" startIcon={<NearMeIcon />} onClick={() => onDirections(place)} sx={{ flex: 1 }}>
              Ir
            </Button>
          </Stack>
      </Stack>
    </Paper>
  );
}
