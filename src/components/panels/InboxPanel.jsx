import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import AddLinkIcon from '@mui/icons-material/AddLink';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditLocationAltIcon from '@mui/icons-material/EditLocationAlt';
import LinkIcon from '@mui/icons-material/Link';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import { useMemo, useState } from 'react';
import { CategoryBadge, SourceBadge, TagList, TypeIcon } from '../common/placeUtils';

export default function InboxPanel({ inbox, onAddLink, onSave, onEdit, onDiscard }) {
  const [source, setSource] = useState('all');
  const sources = useMemo(() => ['all', ...new Set(inbox.map((item) => item.sourceType))], [inbox]);
  const visibleItems = source === 'all' ? inbox : inbox.filter((item) => item.sourceType === source);

  return (
    <Stack spacing={1.5} sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary" fontWeight={750} sx={{ flex: 1 }}>
          Enlaces importados
        </Typography>
        <Button variant="contained" size="small" startIcon={<AddLinkIcon />} onClick={onAddLink}>
          Pegar enlace
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap sx={{ overflowX: 'auto', pb: 0.5 }}>
        {sources.map((itemSource) => (
          <Chip
            key={itemSource}
            label={itemSource === 'all' ? `Todas (${inbox.length})` : itemSource}
            color={source === itemSource ? 'primary' : 'default'}
            variant={source === itemSource ? 'filled' : 'outlined'}
            onClick={() => setSource(itemSource)}
          />
        ))}
      </Stack>

      {visibleItems.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderColor: 'rgba(0,97,111,0.16)' }}>
          <Stack spacing={1.5} alignItems="center">
            <LinkIcon color="primary" />
            <Typography variant="h4">Nada por revisar</Typography>
            <Typography color="text.secondary">Pega un link de mapas, Tripadvisor o Instagram para previsualizarlo antes de guardarlo.</Typography>
            <Button variant="outlined" startIcon={<AddLinkIcon />} onClick={onAddLink}>
              Añadir enlace
            </Button>
          </Stack>
        </Paper>
      ) : (
        visibleItems.map((item) => (
          <Paper key={item.id} variant="outlined" sx={{ p: 1.4, borderColor: 'rgba(0,97,111,0.14)' }}>
            <Stack direction="row" spacing={1.5} alignItems="stretch">
              <Box
                sx={{
                  width: 54,
                  minWidth: 54,
                  height: 54,
                  borderRadius: 2,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: 'rgba(0,97,111,0.08)',
                  color: 'primary.main',
                }}
              >
                <TypeIcon category={item.category} />
              </Box>

              <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <SourceBadge sourceType={item.sourceType} />
                  <CategoryBadge category={item.category} />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', display: { xs: 'none', sm: 'block' } }}>
                    Pendiente
                  </Typography>
                  <IconButton size="small" aria-label="Editar antes de guardar" onClick={() => onEdit(item)}>
                    <EditLocationAltIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <Box>
                  <Typography variant="h4" noWrap>
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {item.address}
                  </Typography>
                </Box>
                <TagList tags={item.tags} limit={3} />
                <Stack direction="row" spacing={1} sx={{ '& .MuiButton-root': { minWidth: 0, px: { xs: 1, sm: 2 } } }}>
                  <Button sx={{ flex: 1 }} variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={() => onDiscard(item.id)}>
                    Descartar
                  </Button>
                  <Button sx={{ flex: 1 }} variant="contained" color="secondary" startIcon={<SaveAltIcon />} onClick={() => onSave(item)}>
                    Guardar
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          </Paper>
        ))
      )}
    </Stack>
  );
}
