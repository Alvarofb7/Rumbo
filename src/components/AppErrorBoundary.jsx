import { Component } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { captureDiagnostic } from '../lib/diagnostics';

export function deriveErrorBoundaryState(nextProps, previousState) {
  if (previousState.hasError && nextProps.resetKey !== previousState.resetKey) {
    return { hasError: false, error: null, resetKey: nextProps.resetKey };
  }
  return null;
}

export class AppErrorBoundary extends Component {
  state = { hasError: false, error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(nextProps, previousState) {
    return deriveErrorBoundaryState(nextProps, previousState);
  }

  componentDidCatch(error, info) {
    captureDiagnostic('app.render', error, { componentStack: info.componentStack || '' });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, resetKey: this.props.resetKey });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Box component="main" role="status" aria-live="assertive" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Paper elevation={0} sx={{ width: '100%', maxWidth: 440, p: 3, border: '1px solid', borderColor: 'divider' }}>
          <Typography component="h1" variant="h5" gutterBottom>
            No pudimos cargar Rumbo
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Tus datos no se han eliminado. Inténtalo de nuevo o recarga la aplicación.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={this.handleRetry}>Reintentar</Button>
            <Button variant="outlined" onClick={this.handleReload}>Recargar</Button>
          </Box>
        </Paper>
      </Box>
    );
  }
}
