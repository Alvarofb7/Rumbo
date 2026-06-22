import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MoreVertIcon from '@mui/icons-material/MoreVert';
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
  const [actionsAnchor, setActionsAnchor] = useState(null);
  const [actionsPlace, setActionsPlace] = useState(null);

  useEffect(() => {
    selectedPlaceRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [selectedPlace?.id]);

  function openActions(event, place) {
    setActionsAnchor(event.currentTarget);
    setActionsPlace(place);
  }

  function closeActions() {
    setActionsAnchor(null);
    setActionsPlace(null);
  }

  function runAction(action) {
    const place = actionsPlace;
    closeActions();
    if (place) action(place);
  }

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
                sx={{
                  py: 1.4,
                  outline: 0,
                  bgcolor: selected ? 'rgba(0,97,111,0.08)' : 'transparent',
                  border: selected ? '1px solid rgba(0,97,111,0.24)' : '1px solid transparent',
                  mx: -1,
                  px: 1,
                  borderRadius: 2,
                  transition: 'background-color 160ms ease, border-color 160ms ease',
                }}
              >
                <Stack direction="row" spacing={0.4} alignItems="flex-start">
                  <Stack
                    component="button"
                    type="button"
                    direction="row"
                    spacing={1.2}
                    alignItems="flex-start"
                    onClick={() => onSelect(place)}
                    sx={{
                      p: 0,
                      border: 0,
                      bgcolor: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                      minWidth: 0,
                      flex: 1,
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 2,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        flex: '0 0 auto',
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
                  </Stack>
                  <IconButton
                    aria-label={`Acciones para ${place.name}`}
                    aria-haspopup="menu"
                    aria-expanded={actionsPlace?.id === place.id ? 'true' : undefined}
                    onClick={(event) => openActions(event, place)}
                    sx={{ mt: -0.5, mr: -0.5, color: 'text.secondary' }}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </Stack>
              </Box>
            );
          })
        )}
      </Stack>

      <Menu
        anchorEl={actionsAnchor}
        open={Boolean(actionsAnchor)}
        onClose={closeActions}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 190, borderRadius: '14px', mt: 0.5 } } }}
      >
        <MenuItem onClick={() => runAction((place) => onDirections?.(place))} sx={{ minHeight: 48 }}>
          <ListItemIcon>
            <NearMeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Cómo llegar</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => runAction(onEdit)} sx={{ minHeight: 48 }}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Editar</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => runAction((place) => onDelete(place.id))} sx={{ minHeight: 48, color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Eliminar</ListItemText>
        </MenuItem>
      </Menu>
    </Stack>
  );
}
