import AppleIcon from '@mui/icons-material/Apple';
import ExploreIcon from '@mui/icons-material/Explore';
import InstagramIcon from '@mui/icons-material/Instagram';
import MapIcon from '@mui/icons-material/Map';
import PublicIcon from '@mui/icons-material/Public';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import StarIcon from '@mui/icons-material/Star';
import TripOriginIcon from '@mui/icons-material/TripOrigin';
import { Chip, Stack, Typography } from '@mui/material';
import { sourceMeta, statusOptions } from '../../data/demoData';

const sourceIcons = {
  google: MapIcon,
  apple: AppleIcon,
  instagram: InstagramIcon,
  tripadvisor: ExploreIcon,
  manual: TripOriginIcon,
};

export function getStatusMeta(status) {
  return statusOptions.find((option) => option.value === status) || statusOptions[0];
}

export function getPlaceColor(place) {
  if (place.status === 'favorite') return '#f9b826';
  if (place.status === 'visited') return '#0b9b72';
  if ((place.tags || []).some((tag) => ['Bar', 'Vino', 'Coctelería'].includes(tag))) return '#8a4d09';
  if ((place.tags || []).some((tag) => ['Restaurante', 'Tapas', 'Brunch'].includes(tag))) return '#f28c38';
  if ((place.tags || []).some((tag) => ['Mirador', 'Museo', 'Arquitectura'].includes(tag))) return '#6f7f5f';
  return sourceMeta[place.sourceType]?.color || '#00616f';
}

export function SourceBadge({ sourceType, compact = false }) {
  const Icon = sourceIcons[sourceType] || PublicIcon;
  const meta = sourceMeta[sourceType] || sourceMeta.manual;

  return (
    <Chip
      size="small"
      icon={<Icon />}
      label={compact ? undefined : meta.label}
      sx={{
        bgcolor: `${meta.color}12`,
        color: meta.color,
        borderColor: `${meta.color}28`,
        '& .MuiChip-icon': { color: meta.color },
      }}
      variant="outlined"
    />
  );
}

export function RatingText({ rating }) {
  if (!Number(rating)) return <Typography variant="body2" color="text.secondary">Sin ranking</Typography>;

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <StarIcon sx={{ color: 'secondary.main', fontSize: 17 }} />
      <Typography variant="body2" fontWeight={700}>
        {Number(rating).toFixed(1).replace('.', ',')}
      </Typography>
    </Stack>
  );
}

export function TagList({ tags = [], limit = 4 }) {
  const visible = tags.slice(0, limit);
  const rest = tags.length - visible.length;

  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {visible.map((tag) => (
        <Chip key={tag} size="small" label={tag} sx={{ bgcolor: 'rgba(0,97,111,0.08)' }} />
      ))}
      {rest > 0 && <Chip size="small" label={`+${rest}`} variant="outlined" />}
    </Stack>
  );
}

export function TypeIcon({ tags = [] }) {
  const primary = tags[0] || '';
  if (['Restaurante', 'Tapas', 'Brunch'].includes(primary)) return <RestaurantIcon />;
  if (['Mirador', 'Museo', 'Arquitectura'].includes(primary)) return <ExploreIcon />;
  return <TripOriginIcon />;
}
