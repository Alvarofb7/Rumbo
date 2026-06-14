import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import DownloadIcon from '@mui/icons-material/Download';
import FilterListIcon from '@mui/icons-material/FilterList';
import InboxIcon from '@mui/icons-material/Inbox';
import LogoutIcon from '@mui/icons-material/Logout';
import StorageIcon from '@mui/icons-material/Storage';
import { useAuth } from '../../context/AuthContext';

export default function AppMenuDrawer({
  stats,
  places,
  inbox,
  firebaseReady,
  onClose,
  onOpenPlaces,
  onOpenReview,
  onOpenFilters,
}) {
  const { user, signOut } = useAuth();

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      user: {
        uid: user.uid,
        email: user.email,
      },
      places,
      inbox,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rumbo-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function runAndClose(action) {
    action();
    onClose();
  }

  return (
    <Box sx={{ width: 332, maxWidth: '100vw', p: 2, pb: `calc(18px + env(safe-area-inset-bottom))` }}>
      <Stack spacing={2.2}>
        <Stack direction="row" spacing={1.3} alignItems="center">
          <Avatar src={user.photoURL || ''} sx={{ width: 52, height: 52, bgcolor: 'primary.main', fontWeight: 900 }}>
            {(user.displayName || user.email || 'R').charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h3">Rumbo</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {user.displayName || user.email}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
          <Chip label={`${stats.saved} lugares`} />
          <Chip label={`${stats.pending} por visitar`} color="warning" variant="outlined" />
          <Chip label={`${stats.favorites} favoritos`} color="secondary" variant="outlined" />
        </Stack>

        <Divider />

        <List disablePadding sx={{ display: 'grid', gap: 0.75 }}>
          <ListItemButton onClick={() => runAndClose(onOpenPlaces)} sx={{ borderRadius: 3 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <BookmarkBorderIcon color="primary" />
            </ListItemIcon>
            <ListItemText primary="Mis lugares" secondary="Lista, ranking y cercanía" />
          </ListItemButton>

          <ListItemButton onClick={() => runAndClose(onOpenFilters)} sx={{ borderRadius: 3 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <FilterListIcon color="primary" />
            </ListItemIcon>
            <ListItemText primary="Filtros y zonas" secondary="Barrio, etiquetas, estado y orden" />
          </ListItemButton>

          <ListItemButton onClick={() => runAndClose(onOpenReview)} sx={{ borderRadius: 3 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Badge badgeContent={inbox.length} color="primary">
                <InboxIcon color="primary" />
              </Badge>
            </ListItemIcon>
            <ListItemText primary="Revisar enlaces" secondary={inbox.length ? `${inbox.length} pendientes` : 'Sin enlaces pendientes'} />
          </ListItemButton>
        </List>

        <Divider />

        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            {firebaseReady ? <CloudDoneIcon color="success" /> : <StorageIcon color="warning" />}
            <Box>
              <Typography fontWeight={850}>{firebaseReady ? 'Sincronizado' : 'Modo local'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {firebaseReady ? 'Tus datos viven por usuario en Firestore.' : 'Firebase no está activo en este entorno.'}
              </Typography>
            </Box>
          </Stack>

          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportData}>
            Exportar JSON
          </Button>
          <Button
            color="error"
            variant="text"
            startIcon={<LogoutIcon />}
            onClick={async () => {
              await signOut();
              onClose();
            }}
          >
            Cerrar sesión
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
