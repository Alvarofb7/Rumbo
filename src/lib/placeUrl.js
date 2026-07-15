const GOOGLE_DOMAIN_SUFFIXES = ['com', 'es', 'co.uk', 'fr', 'de', 'it', 'pt', 'ie', 'nl', 'be', 'ch', 'at', 'ca', 'com.mx', 'com.br', 'com.ar', 'cl', 'co', 'com.pe', 'co.in', 'co.jp', 'com.au', 'co.nz'];
const TRIPADVISOR_DOMAIN_SUFFIXES = ['com', 'es', 'co.uk', 'fr', 'de', 'it', 'pt', 'ie', 'nl', 'be', 'ch', 'at', 'ca', 'com.mx', 'com.br', 'com.ar', 'cl', 'co', 'com.pe', 'in', 'co.jp', 'com.au', 'co.nz'];
const GOOGLE_MAPS_HOSTS = new Set(GOOGLE_DOMAIN_SUFFIXES.flatMap((suffix) => [`google.${suffix}`, `www.google.${suffix}`, `maps.google.${suffix}`]));
const TRIPADVISOR_HOSTS = new Set(TRIPADVISOR_DOMAIN_SUFFIXES.flatMap((suffix) => [`tripadvisor.${suffix}`, `www.tripadvisor.${suffix}`]));
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

export function isSupportedPlaceHost(hostname, pathname = '/') {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (host === 'maps.apple.com' || host === 'maps.app.goo.gl') return true;
  if (host === 'goo.gl') return pathname.toLowerCase().startsWith('/maps');
  if (TRIPADVISOR_HOSTS.has(host) || INSTAGRAM_HOSTS.has(host)) return true;
  return GOOGLE_MAPS_HOSTS.has(host) && (host.startsWith('maps.google.') || pathname.toLowerCase().startsWith('/maps'));
}

export function normalizeSupportedPlaceUrl(rawUrl) {
  const input = String(rawUrl || '').trim();
  if (!input) throw new Error('Pega un enlace válido.');
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https:/i.test(input)) {
    throw new Error('Solo se aceptan enlaces HTTPS.');
  }

  let url;
  try {
    url = new URL(/^https:/i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error('No parece un enlace válido.');
  }

  if (url.protocol !== 'https:') throw new Error('Solo se aceptan enlaces HTTPS.');
  if (url.username || url.password || url.port) throw new Error('El enlace no puede incluir credenciales ni puertos personalizados.');
  if (!isSupportedPlaceHost(url.hostname, url.pathname)) {
    throw new Error('Solo se aceptan enlaces de Google Maps, Apple Maps, Tripadvisor o Instagram.');
  }

  return url.toString();
}

export function isSafeSupportedPlaceUrl(rawUrl) {
  return Boolean(getSafeExternalPlaceUrl(rawUrl));
}

export function getSafeExternalPlaceUrl(rawUrl) {
  try {
    return normalizeSupportedPlaceUrl(rawUrl);
  } catch {
    return '';
  }
}
