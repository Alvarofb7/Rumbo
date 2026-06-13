import { lazy, Suspense } from 'react';
import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './theme';
import { useAuth } from './context/AuthContext';

const LoginScreen = lazy(() => import('./components/LoginScreen'));
const MainApp = lazy(() => import('./components/MainApp'));

export default function App() {
  const { user, loading } = useAuth();

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Suspense
        fallback={
          <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}>
            <CircularProgress />
          </Box>
        }
      >
        {loading || !user ? <LoginScreen loading={loading} /> : <MainApp />}
      </Suspense>
    </ThemeProvider>
  );
}
