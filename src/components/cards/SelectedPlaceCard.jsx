import { Box, Button, IconButton, Paper, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import NearMeIcon from '@mui/icons-material/NearMe';
import { formatDistance } from '../../lib/geo';
import { RatingText, SourceBadge, TagList, TypeIcon } from '../common/placeUtils';

export default function SelectedPlaceCard({ place, onClose, onDirections, onEdit }) {
  if (!place) return null;

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
        borderRadius: 4,
        bgcolor: 'rgba(255,255,255,0.96)',
        border: '1px solid rgba(8,75,67,0.12)',
        boxShadow: '0 22px 56px rgba(6,42,48,0.20)',
        backdropFilter: 'blur(24px)',
      }}
    >
      <Stack direction="row" spacing={1.2} alignItems="stretch">
        {place.imageUrl ? (
          <Box
            component="img"
            src={place.imageUrl}
            alt=""
            sx={{ width: 78, minWidth: 78, borderRadius: 3, objectFit: 'cover', bgcolor: 'primary.light' }}
          />
        ) : (
          <Box
            sx={{
              width: 78,
              minWidth: 78,
              borderRadius: 3,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(15,107,95,0.10)',
              color: 'primary.main',
            }}
          >
            <TypeIcon tags={place.tags} />
          </Box>
        )}

        <Stack spacing={0.65} sx={{ minWidth: 0, flex: 1 }}>
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

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <RatingText rating={place.rating} />
            <SourceBadge sourceType={place.sourceType} compact />
          </Stack>
          <TagList tags={place.tags} limit={2} />

          <Stack direction="row" spacing={1} sx={{ pt: 0.3 }}>
            <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => onEdit(place)} sx={{ flex: 1 }}>
              Editar
            </Button>
            <Button size="small" variant="contained" startIcon={<NearMeIcon />} onClick={() => onDirections(place)} sx={{ flex: 1 }}>
              Ir
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
