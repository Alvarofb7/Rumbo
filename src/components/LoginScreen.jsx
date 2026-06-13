import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import GoogleIcon from '@mui/icons-material/Google';
import MapIcon from '@mui/icons-material/Map';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { useAuth } from '../context/AuthContext';

const featureHighlights = [
  { label: 'Mapa vivo', icon: <MapIcon color="primary" fontSize="small" /> },
  { label: 'Links por revisar', icon: <BookmarkAddIcon color="primary" fontSize="small" /> },
  { label: 'Cerca de ti', icon: <TravelExploreIcon color="primary" fontSize="small" /> },
  { label: 'PWA iPhone', icon: <AutoAwesomeIcon color="primary" fontSize="small" /> },
];

export default function LoginScreen({ loading }) {
  const { signIn, signUp, signInWithGoogle, continueDemo, authError, firebaseReady } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    if (!email || !password) {
      setFormError('Añade email y contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        py: { xs: 2, sm: 4 },
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
            gap: { xs: 3, md: 6 },
            alignItems: 'center',
          }}
        >
          <Stack spacing={3} sx={{ px: { xs: 1, md: 0 } }}>
            <Stack direction="row" spacing={1.2} alignItems="center">
              <Box
                component="img"
                src="/icons/icon-192.png"
                alt="Rumbo"
                sx={{ width: 54, height: 54, borderRadius: 2 }}
              />
              <Box>
                <Typography variant="h2">Rumbo</Typography>
                <Typography color="text.secondary">Tu mapa privado de buenos lugares</Typography>
              </Box>
            </Stack>

            <Typography variant="h1" sx={{ maxWidth: 560 }}>
              Guarda recomendaciones antes de que se pierdan.
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560, lineHeight: 1.7 }}>
              Pega enlaces de Google Maps, Apple Maps, Tripadvisor o Instagram, conviértelos en lugares y ordénalos por
              cercanía, zona, etiquetas y ranking personal.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              {featureHighlights.map(({ label, icon }) => (
                <Paper key={label} variant="outlined" sx={{ p: 1.2, flex: 1, borderColor: 'rgba(0,97,111,0.18)' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {icon}
                    <Typography variant="body2" fontWeight={700}>
                      {label}
                    </Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Stack>

          <Paper
            elevation={0}
            variant="outlined"
            sx={{
              p: { xs: 2, sm: 3 },
              borderColor: 'rgba(0,97,111,0.16)',
              boxShadow: '0 16px 42px rgba(6,42,48,0.08)',
            }}
          >
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="h3">{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {firebaseReady ? 'Sincronización real con Firebase.' : 'Modo local activo hasta configurar Firebase.'}
                </Typography>
              </Box>

              {(formError || authError) && <Alert severity="warning">{formError || authError}</Alert>}

              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={1.5}>
                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    fullWidth
                  />
                  <TextField
                    label="Contraseña"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    fullWidth
                  />
                  <Button type="submit" variant="contained" size="large" disabled={submitting}>
                    {mode === 'login' ? 'Entrar' : 'Registrarme'}
                  </Button>
                </Stack>
              </Box>

              <Divider>o</Divider>

              <Button
                variant="outlined"
                size="large"
                startIcon={<GoogleIcon />}
                onClick={signInWithGoogle}
                sx={{ borderColor: 'rgba(0,97,111,0.28)' }}
              >
                Continuar con Google
              </Button>

              {!firebaseReady && (
                <Button variant="text" onClick={continueDemo}>
                  Probar con datos demo
                </Button>
              )}

              <Typography textAlign="center" color="text.secondary">
                {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
                <Link component="button" type="button" fontWeight={700} onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
                  {mode === 'login' ? 'Regístrate' : 'Entra'}
                </Link>
              </Typography>
            </Stack>
          </Paper>
        </Box>
      </Container>
    </Box>
  );
}
