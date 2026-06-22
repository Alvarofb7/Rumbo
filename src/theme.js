import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0f6b5f',
      dark: '#084b43',
      light: '#e1f2ee',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ffb86b',
      dark: '#d8852f',
      light: '#fff0dc',
      contrastText: '#062a30',
    },
    background: {
      default: '#f7f4ed',
      paper: '#ffffff',
    },
    text: {
      primary: '#062a30',
      secondary: '#607176',
    },
    success: {
      main: '#0b9b72',
    },
    warning: {
      main: '#f28c38',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: 34, fontWeight: 700, letterSpacing: 0 },
    h2: { fontSize: 28, fontWeight: 700, letterSpacing: 0 },
    h3: { fontSize: 22, fontWeight: 700, letterSpacing: 0 },
    h4: { fontSize: 18, fontWeight: 700, letterSpacing: 0 },
    h5: { fontSize: 16, fontWeight: 700, letterSpacing: 0 },
    h6: { fontSize: 15, fontWeight: 700, letterSpacing: 0 },
    body1: { fontSize: 15, letterSpacing: 0 },
    body2: { fontSize: 13, letterSpacing: 0 },
    button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 14,
          minHeight: 44,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 18,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
  },
});
