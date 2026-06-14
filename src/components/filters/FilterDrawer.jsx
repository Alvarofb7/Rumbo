import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
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

  function toggleTag(tag) {
    const nextTags = filters.tags.includes(tag) ? filters.tags.filter((item) => item !== tag) : [...filters.tags, tag];
    patch({ tags: nextTags });
  }

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: '18px 18px 0 0', maxHeight: '88dvh' } }}>
      <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto', p: 2, pb: `calc(18px + env(safe-area-inset-bottom))` }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <FilterListIcon color="primary" />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h3">Filtrar mapa</Typography>
              <Typography color="text.secondary">Sólo cambia los pins visibles en el mapa.</Typography>
            </Box>
            <Button onClick={() => setFilters({ search: '', tags: [], status: 'all', minRating: 0, zone: '', sort: 'nearest' })}>
              Limpiar
            </Button>
          </Stack>

          <TextField label="Buscar pins o notas" value={filters.search} onChange={(event) => patch({ search: event.target.value })} fullWidth />

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
              <MenuItem value="">Todas</MenuItem>
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

          <Divider />

          <Box>
            <Typography variant="h4" sx={{ mb: 1 }}>
              Etiquetas
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {availableTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  color={filters.tags.includes(tag) ? 'primary' : 'default'}
                  variant={filters.tags.includes(tag) ? 'filled' : 'outlined'}
                  onClick={() => toggleTag(tag)}
                />
              ))}
            </Stack>
          </Box>

          <Button variant="contained" onClick={onClose}>
            Aplicar
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
