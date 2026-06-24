import AppleIcon from '@mui/icons-material/Apple';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import ExploreIcon from '@mui/icons-material/Explore';
import InstagramIcon from '@mui/icons-material/Instagram';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import MapIcon from '@mui/icons-material/Map';
import PublicIcon from '@mui/icons-material/Public';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import StarIcon from '@mui/icons-material/Star';
import StorefrontIcon from '@mui/icons-material/Storefront';
import TripOriginIcon from '@mui/icons-material/TripOrigin';
import { Chip, Stack, Typography } from '@mui/material';
import { sourceMeta, statusOptions } from '../../data/demoData';
import { getCategoryLabel } from '../../lib/placeData';

const sourceIcons = {
  google: MapIcon,
  apple: AppleIcon,
  instagram: InstagramIcon,
  tripadvisor: ExploreIcon,
  manual: TripOriginIcon,
};

const categoryMeta = {
  bar: { color: '#8a4d09', Icon: LocalBarIcon },
  restaurant: { color: '#f28c38', Icon: RestaurantIcon },
  cafe: { color: '#8b5e3c', Icon: LocalCafeIcon },
  bakery: { color: '#b45f2a', Icon: BakeryDiningIcon },
  market: { color: '#2f7d5a', Icon: StorefrontIcon },
  other: { color: '#00616f', Icon: TripOriginIcon },
};

export function getStatusMeta(status) {
  return statusOptions.find((option) => option.value === status) || statusOptions[0];
}

export function getPlaceColor(place) {
  if (place.status === 'favorite') return '#f9b826';
  if (place.status === 'visited') return '#0b9b72';
  return categoryMeta[place.category]?.color || categoryMeta.other.color;
}

export function SourceBadge({ sourceType }) {
  const Icon = sourceIcons[sourceType] || PublicIcon;
  const meta = sourceMeta[sourceType] || sourceMeta.manual;

  return (
    <Chip
      size="small"
      icon={<Icon />}
      label={meta.label}
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

export function CategoryBadge({ category }) {
  const meta = categoryMeta[category] || categoryMeta.other;
  const Icon = meta.Icon;

  return (
    <Chip
      size="small"
      icon={<Icon />}
      label={getCategoryLabel(category)}
      variant="outlined"
      sx={{
        bgcolor: `${meta.color}10`,
        borderColor: `${meta.color}30`,
        color: meta.color,
        fontWeight: 750,
        '& .MuiChip-icon': { color: meta.color },
      }}
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
  if (!tags.length) return null;

  const visible = tags.slice(0, limit);
  const rest = tags.length - visible.length;

  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {visible.map((tag) => (
        <Chip
          key={tag}
          size="small"
          label={tag}
          variant="outlined"
          sx={{ bgcolor: '#fff', borderColor: 'rgba(0,97,111,0.20)', color: 'text.secondary', fontWeight: 700 }}
        />
      ))}
      {rest > 0 && <Chip size="small" label={`+${rest}`} variant="outlined" />}
    </Stack>
  );
}

export function TypeIcon({ category = 'other' }) {
  const meta = categoryMeta[category] || categoryMeta.other;
  const Icon = meta.Icon;
  return <Icon />;
}
