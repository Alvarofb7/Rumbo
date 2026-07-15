import { lazy, Suspense } from 'react';
import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { theme } from './theme';
import { useAuth } from './context/AuthContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';

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
        {loading || !user ? <LoginScreen loading={loading} /> : <AppErrorBoundary resetKey={user.uid}><MainApp /></AppErrorBoundary>}
      </Suspense>
      <Analytics />
      <SpeedInsights />
    </ThemeProvider>
  );
}
