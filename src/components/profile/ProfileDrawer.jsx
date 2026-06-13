import { Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import DownloadIcon from '@mui/icons-material/Download';
import LogoutIcon from '@mui/icons-material/Logout';
import StorageIcon from '@mui/icons-material/Storage';
import { useAuth } from '../../context/AuthContext';

export default function ProfileDrawer({ stats, places, inbox, firebaseReady, onClose }) {
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

  return (
    <Box sx={{ width: 330, maxWidth: '100vw', p: 2, pb: `calc(18px + env(safe-area-inset-bottom))` }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h3">Perfil</Typography>
          <Typography color="text.secondary">{user.displayName || user.email}</Typography>
        </Box>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Chip label={`${stats.saved} guardados`} />
          <Chip label={`${stats.pending} pendientes`} color="warning" variant="outlined" />
          <Chip label={`${stats.visited} visitados`} color="success" variant="outlined" />
          <Chip label={`${stats.favorites} favoritos`} color="secondary" variant="outlined" />
        </Stack>

        <Divider />

        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            {firebaseReady ? <CloudDoneIcon color="success" /> : <StorageIcon color="warning" />}
            <Box>
              <Typography fontWeight={800}>{firebaseReady ? 'Firebase activo' : 'Modo local'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {firebaseReady
                  ? 'Tus lugares se guardan por usuario en Firestore.'
                  : 'Rellena .env para activar auth real y sincronización.'}
              </Typography>
            </Box>
          </Stack>
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
    </Box>
  );
}
