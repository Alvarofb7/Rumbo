const issueLimit = 20;
const storageIssues = [];
let dispatchingIssue = false;

function storage() {
  try {
    return globalThis.localStorage;
  } catch (error) {
    reportStorageIssue('access', '', error);
    return null;
  }
}

function reportStorageIssue(operation, key, error) {
  const issue = {
    operation,
    key,
    name: error?.name || 'StorageError',
    message: error?.message || 'Storage is unavailable',
  };
  storageIssues.unshift(issue);
  storageIssues.length = Math.min(storageIssues.length, issueLimit);

  if (dispatchingIssue) return;

  try {
    dispatchingIssue = true;
    globalThis.dispatchEvent?.(new CustomEvent('rumbo:storage-error', { detail: issue }));
  } catch {
    // Diagnostics are best effort; storage failures must never interrupt the app.
  } finally {
    dispatchingIssue = false;
  }
}

function quarantineMalformedValue(key, value) {
  const localStorage = storage();
  if (!localStorage) return;

  let backedUp = false;
  try {
    localStorage.setItem(`${key}.corrupt.${Date.now()}`, value);
    backedUp = true;
  } catch (error) {
    reportStorageIssue('quarantine', key, error);
  }

  if (!backedUp) return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    reportStorageIssue('remove-corrupt', key, error);
  }
}

export function readStorageJson(key, fallback, { validate = () => true, quarantine = false } = {}) {
  const localStorage = storage();
  if (!localStorage) return fallback;

  let value;
  try {
    value = localStorage.getItem(key);
  } catch (error) {
    reportStorageIssue('read', key, error);
    return fallback;
  }

  if (value === null) return fallback;

  try {
    const parsed = JSON.parse(value);
    if (validate(parsed)) return parsed;
    throw new Error('Stored value has an unexpected shape.');
  } catch (error) {
    reportStorageIssue('parse', key, error);
    if (quarantine) quarantineMalformedValue(key, value);
    else removeStorageValue(key);
    return fallback;
  }
}

export function writeStorageJson(key, value) {
  const localStorage = storage();
  if (!localStorage) return false;

  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    reportStorageIssue('write', key, error);
    return false;
  }
}

export function removeStorageValue(key) {
  const localStorage = storage();
  if (!localStorage) return false;

  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    reportStorageIssue('remove', key, error);
    return false;
  }
}

export function getStorageIssues() {
  return [...storageIssues];
}

export function clearStorageIssues() {
  storageIssues.length = 0;
}
