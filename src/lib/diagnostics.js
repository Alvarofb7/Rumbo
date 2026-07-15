import { readStorageJson, removeStorageValue, writeStorageJson } from './storage';

const diagnosticsKey = 'rumbo.diagnostics.v1';
const breadcrumbsKey = 'rumbo.breadcrumbs.v1';
const diagnosticsMaxAge = 7 * 24 * 60 * 60 * 1000;
const breadcrumbsMaxAge = 24 * 60 * 60 * 1000;
const diagnosticsLimit = 40;
const breadcrumbsLimit = 30;
const installFlag = '__rumboDiagnosticsInstalled';

function truncate(value, limit) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function redact(value) {
  return String(value || '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/users\/[\w.:@+-]+/g, 'users/[user]')
    .replace(/([?&](?:key|token|auth|signature)=)[^&\s]+/gi, '$1[redacted]');
}

function getEnvironment() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};

  return {
    online: navigator.onLine !== false,
    standalone: Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone),
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    userAgent: truncate(navigator.userAgent, 240),
    path: window.location?.pathname || '/',
  };
}

function sanitizeContext(context = {}) {
  return Object.fromEntries(
    Object.entries(context)
      .slice(0, 10)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) || value === null)
      .map(([key, value]) => [key, typeof value === 'string' ? truncate(redact(value), 160) : value]),
  );
}

function readStoredDiagnostics() {
  const stored = readStorageJson(diagnosticsKey, [], { validate: Array.isArray });
  const cutoff = Date.now() - diagnosticsMaxAge;
  return stored.filter((item) => Date.parse(item.timestamp) >= cutoff).slice(0, diagnosticsLimit);
}

function readStoredBreadcrumbs() {
  const stored = readStorageJson(breadcrumbsKey, [], { validate: Array.isArray });
  const cutoff = Date.now() - breadcrumbsMaxAge;
  return stored.filter((item) => Date.parse(item.timestamp) >= cutoff).slice(0, breadcrumbsLimit);
}

function writeStoredDiagnostics(items) {
  writeStorageJson(diagnosticsKey, items.slice(0, diagnosticsLimit));
}

function writeStoredBreadcrumbs(items) {
  writeStorageJson(breadcrumbsKey, items.slice(0, breadcrumbsLimit));
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: truncate(error.name || 'Error', 80),
      message: truncate(redact(error.message || 'Error sin mensaje'), 320),
      stack: truncate(redact(error.stack || ''), 1600),
    };
  }

  if (typeof error === 'object' && error) {
    return {
      name: truncate(error.name || 'Error', 80),
      message: truncate(redact(error.message || String(error)), 320),
      stack: truncate(redact(error.stack || ''), 1600),
    };
  }

  return { name: 'Error', message: truncate(redact(error || 'Error sin mensaje'), 320), stack: '' };
}

export function getDiagnostics() {
  return readStoredDiagnostics();
}

export function captureDiagnostic(area, error, context = {}) {
  const normalizedError = normalizeError(error);
  const items = readStoredDiagnostics();
  const now = new Date();
  const latest = items[0];

  if (
    latest?.area === area &&
    latest?.message === normalizedError.message &&
    now.getTime() - Date.parse(latest.timestamp) < 10000
  ) {
    const updatedItems = [{ ...latest, count: Number(latest.count || 1) + 1, timestamp: now.toISOString() }, ...items.slice(1)];
    writeStoredDiagnostics(updatedItems);
    return updatedItems[0];
  }

  const item = {
    id: globalThis.crypto?.randomUUID?.() || `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    timestamp: now.toISOString(),
    area,
    ...normalizedError,
    context: sanitizeContext(context),
    environment: getEnvironment(),
    count: 1,
  };
  writeStoredDiagnostics([item, ...items]);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('rumbo:diagnostic', { detail: item }));
    } catch {
      return item;
    }
  }

  return item;
}

export function recordBreadcrumb(area, context = {}) {
  const item = {
    timestamp: new Date().toISOString(),
    area,
    context: sanitizeContext(context),
  };
  writeStoredBreadcrumbs([item, ...readStoredBreadcrumbs()]);
  return item;
}

export function clearDiagnostics() {
  removeStorageValue(diagnosticsKey);
  removeStorageValue(breadcrumbsKey);
}

export function buildDiagnosticsReport() {
  return {
    generatedAt: new Date().toISOString(),
    application: 'Rumbo',
    diagnosticVersion: 1,
    environment: getEnvironment(),
    incidents: readStoredDiagnostics(),
    breadcrumbs: readStoredBreadcrumbs(),
  };
}

export async function shareDiagnostics() {
  if (typeof document === 'undefined') return false;
  const report = buildDiagnosticsReport();
  const contents = JSON.stringify(report, null, 2);
  const fileName = `rumbo-diagnostico-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([contents], fileName, { type: 'application/json' });

  let canShareFile = false;
  try {
    canShareFile = Boolean(navigator.share && navigator.canShare?.({ files: [file] }));
  } catch {
    canShareFile = false;
  }

  if (canShareFile) {
    try {
      await navigator.share({ title: 'Diagnóstico de Rumbo', files: [file] });
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function installGlobalDiagnostics() {
  if (typeof window === 'undefined' || window[installFlag]) return;
  window[installFlag] = true;
  recordBreadcrumb('app.start', { serviceWorker: 'serviceWorker' in navigator });

  window.addEventListener('error', (event) => {
    let source = '';
    try {
      source = event.filename ? new URL(event.filename, window.location.href).pathname : '';
    } catch {
      source = truncate(event.filename, 160);
    }
    captureDiagnostic('window.error', event.error || event.message, {
      source,
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    captureDiagnostic('window.unhandledrejection', event.reason);
  });
  window.addEventListener('rumbo:storage-error', (event) => {
    const issue = event.detail || {};
    if (issue.key === diagnosticsKey || issue.key === breadcrumbsKey) return;
    captureDiagnostic(`storage.${issue.operation || 'unknown'}`, new Error(issue.message || 'Storage unavailable'), {
      key: issue.key || '',
    });
  });
}
