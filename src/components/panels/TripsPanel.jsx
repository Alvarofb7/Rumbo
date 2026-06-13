import { Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import RouteIcon from '@mui/icons-material/Route';

export default function TripsPanel({ places, onSelectZone }) {
  const zones = Object.entries(
    places.reduce((acc, place) => {
      const zone = place.zone || 'Sin zona';
      acc[zone] = acc[zone] || [];
      acc[zone].push(place);
      return acc;
    }, {}),
  ).sort((a, b) => b[1].length - a[1].length);

  const topTags = Object.entries(
    places
      .flatMap((place) => place.tags || [])
      .reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <RouteIcon color="primary" />
        <Box>
          <Typography variant="h3">Zonas</Typography>
          <Typography color="text.secondary">Explora tus lugares guardados por ciudad, barrio o viaje.</Typography>
        </Box>
      </Stack>

      <Box>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Zonas
        </Typography>
        <Stack divider={<Divider flexItem />}>
          {zones.map(([zone, zonePlaces]) => (
            <Stack key={zone} direction="row" spacing={1} alignItems="center" sx={{ py: 1.25 }}>
              <Box sx={{ flex: 1 }}>
                <Typography fontWeight={800}>{zone}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {zonePlaces.length} lugares, {zonePlaces.filter((place) => place.status === 'wishlist').length} pendientes
                </Typography>
              </Box>
              <Button variant="outlined" onClick={() => onSelectZone(zone === 'Sin zona' ? '' : zone)}>
                Abrir zona
              </Button>
            </Stack>
          ))}
        </Stack>
      </Box>

      <Box>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Etiquetas frecuentes
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {topTags.map(([tag, count]) => (
            <Chip key={tag} label={`${tag} · ${count}`} />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
