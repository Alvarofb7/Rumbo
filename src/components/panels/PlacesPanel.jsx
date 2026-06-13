import { useEffect, useRef } from 'react';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NearMeIcon from '@mui/icons-material/NearMe';
import PlaceIcon from '@mui/icons-material/Place';
import { formatDistance } from '../../lib/geo';
import { getStatusMeta, RatingText, SourceBadge, TagList, TypeIcon } from '../common/placeUtils';

const sortLabels = {
  nearest: 'Cercanía',
  ranking: 'Ranking',
  zone: 'Zona',
  recent: 'Recientes',
};

export default function PlacesPanel({
  title = 'Cerca de ti',
  places,
  selectedPlace,
  filters,
  setFilters,
  stats,
  onSelect,
  onEdit,
  onDelete,
  onDirections,
  onOpenFilters,
}) {
  const selectedPlaceRef = useRef(null);

  useEffect(() => {
    selectedPlaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedPlace?.id]);

  return (
    <Stack spacing={1.5} sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <PlaceIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h3">{title}</Typography>
          <Typography color="text.secondary">{places.length} lugares filtrados</Typography>
        </Box>
        <IconButton onClick={onOpenFilters}>
          <FilterListIcon />
        </IconButton>
      </Stack>

      <Paper variant="outlined" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderColor: 'rgba(0,97,111,0.12)' }}>
        {[
          ['Guardados', stats.saved],
          ['Por visitar', stats.pending],
          ['Visitados', stats.visited],
        ].map(([label, value], index) => (
          <Box key={label} sx={{ p: 1.25, textAlign: 'center', borderLeft: index ? '1px solid rgba(0,97,111,0.10)' : 0 }}>
            <Typography variant="h4">{value}</Typography>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
          </Box>
        ))}
      </Paper>

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h4" sx={{ flex: 1 }}>
          Lista
        </Typography>
        <Select
          size="small"
          value={filters.sort}
          IconComponent={KeyboardArrowDownIcon}
          onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}
          sx={{ minWidth: 132 }}
        >
          {Object.entries(sortLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      {filters.zone && <Chip label={`Zona: ${filters.zone}`} onDelete={() => setFilters((current) => ({ ...current, zone: '' }))} />}

      <Stack divider={<Divider flexItem />} sx={{ borderTop: '1px solid rgba(0,97,111,0.10)' }}>
        {places.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <Typography variant="h4">No hay lugares con estos filtros</Typography>
            <Typography color="text.secondary">Prueba quitando etiquetas o bajando el ranking mínimo.</Typography>
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
                      width: 54,
                      height: 54,
                      borderRadius: 2,
                      bgcolor: 'rgba(0,97,111,0.08)',
                      color: 'primary.main',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <TypeIcon tags={place.tags} />
                  </Box>
                  <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
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
                    <TagList tags={place.tags} limit={3} />
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <RatingText rating={place.rating} />
                      <Chip size="small" label={statusMeta.label} sx={{ color: statusMeta.color, bgcolor: `${statusMeta.color}14` }} />
                      <SourceBadge sourceType={place.sourceType} compact />
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
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); onEdit(place); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); onDelete(place.id); }}>
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
