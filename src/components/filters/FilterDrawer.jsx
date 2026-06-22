import {
  Box,
  Button,
  Checkbox,
  Drawer,
  FormControl,
  FormHelperText,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { statusOptions } from '../../data/demoData';

export default function FilterDrawer({ open, filters, setFilters, onClose, places }) {
  const availableTags = [...new Set(places.flatMap((place) => place.tags || []))].sort();
  const zones = [...new Set(places.map((place) => place.zone).filter(Boolean))].sort();

  function patch(nextPatch) {
    setFilters((current) => ({ ...current, ...nextPatch }));
  }

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: '16px 16px 0 0', maxHeight: '88dvh' } }}>
      <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto', p: 2, pb: `calc(18px + env(safe-area-inset-bottom))` }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <FilterListIcon color="primary" />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h3">Filtrar mapa</Typography>
              <Typography color="text.secondary">Solo cambia los lugares visibles en el mapa.</Typography>
            </Box>
            <Button onClick={() => setFilters({ tags: [], status: 'all', minRating: 0, zone: 'all', sort: 'nearest' })}>
              Limpiar
            </Button>
          </Stack>

          <FormControl fullWidth>
            <InputLabel>Estado</InputLabel>
            <Select label="Estado" value={filters.status} onChange={(event) => patch({ status: event.target.value })}>
              <MenuItem value="all">Todos</MenuItem>
              {statusOptions.map((status) => (
                <MenuItem key={status.value} value={status.value}>
                  {status.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Zona</InputLabel>
            <Select label="Zona" value={filters.zone} onChange={(event) => patch({ zone: event.target.value })}>
              <MenuItem value="all">Todas</MenuItem>
              {zones.map((zone) => (
                <MenuItem key={zone} value={zone}>
                  {zone}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography fontWeight={800}>Ranking mínimo: {filters.minRating.toFixed(1)}</Typography>
            <Slider min={0} max={5} step={0.5} value={filters.minRating} onChange={(_, value) => patch({ minRating: value })} />
          </Box>

          <FormControl fullWidth disabled={!availableTags.length}>
            <InputLabel shrink>Etiquetas</InputLabel>
            <Select
              multiple
              displayEmpty
              label="Etiquetas"
              value={filters.tags}
              onChange={(event) => {
                const value = event.target.value;
                patch({ tags: typeof value === 'string' ? value.split(',') : value });
              }}
              renderValue={(selected) => {
                if (!availableTags.length) return 'Sin etiquetas disponibles';
                return selected.length ? selected.join(', ') : 'Todas';
              }}
            >
              {availableTags.map((tag) => (
                <MenuItem key={tag} value={tag}>
                  <Checkbox checked={filters.tags.includes(tag)} />
                  <ListItemText primary={tag} />
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {availableTags.length ? 'Puedes seleccionar varias.' : 'Añade etiquetas a algún lugar para filtrarlas aquí.'}
            </FormHelperText>
          </FormControl>

          <Button variant="contained" onClick={onClose}>
            Aplicar
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
