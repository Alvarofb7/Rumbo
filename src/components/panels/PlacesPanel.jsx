import { useEffect, useRef } from 'react';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NearMeIcon from '@mui/icons-material/NearMe';
import { formatDistance } from '../../lib/geo';
import { CategoryBadge, getStatusMeta, RatingText, TagList, TypeIcon } from '../common/placeUtils';

const sortLabels = {
  nearest: 'Cercanía',
  ranking: 'Ranking',
  zone: 'Zona',
  recent: 'Recientes',
};

export default function PlacesPanel({
  places,
  selectedPlace,
  totalPlaces,
  sort,
  onSortChange,
  onSelect,
  onEdit,
  onDelete,
  onDirections,
}) {
  const selectedPlaceRef = useRef(null);

  useEffect(() => {
    selectedPlaceRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [selectedPlace?.id]);

  return (
    <Stack spacing={1} sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {totalPlaces} guardados
        </Typography>
        <Select
          size="small"
          value={sort}
          IconComponent={KeyboardArrowDownIcon}
          onChange={(event) => onSortChange(event.target.value)}
          sx={{ minWidth: 128 }}
        >
          {Object.entries(sortLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      <Stack divider={<Divider flexItem />} sx={{ borderTop: '1px solid rgba(8,75,67,0.08)' }}>
        {places.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="h4">Aún no hay lugares</Typography>
            <Typography color="text.secondary">Guarda tu primer sitio desde el botón +.</Typography>
          </Box>
        ) : (
          places.map((place) => {
            const selected = selectedPlace?.id === place.id;
            const statusMeta = getStatusMeta(place.status);

            return (
              <Box
                key={place.id}
                ref={selected ? selectedPlaceRef : null}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(place)}
                onKeyDown={(event) => event.key === 'Enter' && onSelect(place)}
                sx={{
                  py: 1.4,
                  cursor: 'pointer',
                  outline: 0,
                  bgcolor: selected ? 'rgba(0,97,111,0.08)' : 'transparent',
                  border: selected ? '1px solid rgba(0,97,111,0.24)' : '1px solid transparent',
                  mx: -1,
                  px: 1,
                  borderRadius: 2,
                  transition: 'background-color 160ms ease, border-color 160ms ease',
                }}
              >
                <Stack direction="row" spacing={1.2} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: 'rgba(0,97,111,0.08)',
                      color: 'primary.main',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <TypeIcon category={place.category} />
                  </Box>
                  <Stack spacing={0.55} sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="h4" noWrap sx={{ flex: 1 }}>
                        {place.name}
                      </Typography>
                      <Typography variant="body2" color="success.main" fontWeight={700}>
                        {formatDistance(place.distance)}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {place.zone || place.address}
                    </Typography>
                    {(place.tags || []).length > 0 && <TagList tags={place.tags} limit={2} />}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <RatingText rating={place.rating} />
                      <CategoryBadge category={place.category} />
                      <Chip size="small" label={statusMeta.label} sx={{ color: statusMeta.color, bgcolor: `${statusMeta.color}14` }} />
                    </Stack>
                  </Stack>
                  <Stack spacing={0.5}>
                    <IconButton
                      size="small"
                      aria-label={`Ir a ${place.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDirections?.(place);
                      }}
                    >
                      <NearMeIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Editar ${place.name}`} onClick={(event) => { event.stopPropagation(); onEdit(place); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Eliminar ${place.name}`} onClick={(event) => { event.stopPropagation(); onDelete(place.id); }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              </Box>
            );
          })
        )}
      </Stack>
    </Stack>
  );
}
