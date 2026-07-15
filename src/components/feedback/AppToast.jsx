import { Alert, Button } from '@mui/material';

const validSeverities = new Set(['success', 'info', 'warning', 'error']);

export function createToast(message, severity = 'success', options = {}) {
  return {
    message: String(message || ''),
    severity: validSeverities.has(severity) ? severity : 'info',
    undoDelete: Boolean(options.undoDelete),
  };
}

export default function AppToast({ toast, onClose, onUndo, elevated = false }) {
  if (!toast?.message) return null;

  return (
    <Alert
      severity={toast.severity}
      onClose={onClose}
      action={
        toast.undoDelete && onUndo ? (
          <Button color="inherit" size="small" onClick={onUndo}>
            Deshacer
          </Button>
        ) : undefined
      }
      sx={{
        position: 'absolute',
        left: { xs: 12, md: 18 },
        right: { xs: 12, md: 'auto' },
        bottom: elevated ? 'calc(154px + env(safe-area-inset-bottom))' : 'calc(88px + env(safe-area-inset-bottom))',
        zIndex: 980,
        width: { md: 390 },
        borderRadius: '14px',
        boxShadow: '0 18px 44px rgba(6,42,48,0.18)',
      }}
    >
      {toast.message}
    </Alert>
  );
}
