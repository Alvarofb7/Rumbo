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
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import BugReportIcon from '@mui/icons-material/BugReport';
import DownloadIcon from '@mui/icons-material/Download';
import AddLinkIcon from '@mui/icons-material/AddLink';
import InboxIcon from '@mui/icons-material/Inbox';
import LogoutIcon from '@mui/icons-material/Logout';
import StorageIcon from '@mui/icons-material/Storage';
import SyncIcon from '@mui/icons-material/Sync';
import { useAuth } from '../../context/AuthContext';
import { captureDiagnostic, getDiagnostics, shareDiagnostics } from '../../lib/diagnostics';
import { LocationPrivacySettings } from '../privacy/LocationPrivacy';

export default function AppMenuDrawer({
  stats,
  places,
  inbox,
  syncState,
  locationConsent,
  locationStatus,
  onClose,
  onImportLink,
  onOpenReview,
  onRetrySync,
  onEnableLocation,
  onDisableLocation,
}) {
  const { user, signOut } = useAuth();
  const diagnosticCount = getDiagnostics().reduce((total, incident) => total + Number(incident.count || 1), 0);

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

  async function handleShareDiagnostics() {
    try {
      await shareDiagnostics();
    } catch (error) {
      if (error?.name !== 'AbortError') captureDiagnostic('diagnostics.share', error);
    }
  }

  const syncMeta = {
    synced: { label: 'Sincronizado', description: 'Todos los cambios están guardados.', icon: <CloudDoneIcon color="success" /> },
    pending: { label: 'Guardando…', description: 'Hay cambios pendientes de subir.', icon: <CloudSyncIcon color="warning" /> },
    reconnecting: { label: 'Reconectando…', description: 'Se está restableciendo la conexión con tus datos.', icon: <CloudSyncIcon color="warning" /> },
    offline: { label: 'Sin conexión', description: 'Los cambios se subirán cuando vuelva la red.', icon: <CloudOffIcon color="warning" /> },
    error: { label: 'Error de sincronización', description: 'No se han podido sincronizar los cambios. Vuelve a conectar.', icon: <CloudOffIcon color="error" /> },
    local: { label: 'Modo local', description: 'Los datos se guardan en este dispositivo.', icon: <StorageIcon color="warning" /> },
  }[syncState.status];

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
          <ListItemButton onClick={() => runAndClose(onImportLink)} sx={{ borderRadius: 3, minHeight: 52 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <AddLinkIcon color="primary" />
            </ListItemIcon>
            <ListItemText primary="Importar enlace" secondary="Maps, Tripadvisor o Instagram" />
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

        <LocationPrivacySettings
          consent={locationConsent}
          status={locationStatus}
          onEnable={onEnableLocation}
          onDisable={onDisableLocation}
        />

        <Divider />

        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            {syncMeta.icon}
            <Box>
              <Typography fontWeight={850}>{syncMeta.label}</Typography>
              <Typography variant="body2" color="text.secondary">
                {syncMeta.description}
              </Typography>
            </Box>
          </Stack>

          {['offline', 'error'].includes(syncState.status) && (
            <Button variant="outlined" startIcon={<SyncIcon />} onClick={onRetrySync}>
              Reconectar sincronización
            </Button>
          )}

          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportData}>
            Exportar JSON
          </Button>
          <Button variant="outlined" startIcon={<BugReportIcon />} onClick={() => void handleShareDiagnostics()}>
            Compartir diagnóstico{diagnosticCount ? ` (${diagnosticCount})` : ''}
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
