export const categoryOptions = [
  { value: 'bar', label: 'Bar' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'tapas', label: 'Tapas' },
  { value: 'sushi', label: 'Sushi / japonés' },
  { value: 'grill', label: 'Carne / parrilla' },
  { value: 'seafood', label: 'Pescado / marisco' },
  { value: 'cafe', label: 'Café' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'culture', label: 'Cultura' },
  { value: 'shopping', label: 'Compras' },
  { value: 'other', label: 'Otro' },
];

const categoryValues = new Set(categoryOptions.map((option) => option.value));
const statusLabels = new Set(['pendiente', 'favorito', 'quiero ir', 'he ido', 'visitado', 'descartado']);
const categoryTagAliases = {
  bar: ['bar', 'pub', 'taberna', 'bodega'],
  restaurant: ['restaurante', 'restaurant'],
  tapas: ['tapas', 'tapeo', 'pinchos', 'pintxos'],
  sushi: ['sushi', 'japonés', 'japones', 'ramen', 'omakase', 'izakaya'],
  grill: ['carne', 'parrilla', 'asador', 'asado', 'steak', 'grill', 'barbacoa', 'bbq'],
  seafood: ['pescado', 'marisco', 'marisquería', 'marisqueria', 'seafood', 'ceviche'],
  cafe: ['café', 'cafe', 'coffee', 'panadería', 'panaderia', 'bakery'],
  hotel: ['hotel', 'hostal', 'alojamiento'],
  culture: ['cultura', 'museo', 'galería', 'galeria', 'monumento', 'mirador', 'parque'],
  shopping: ['compras', 'tienda', 'mercado', 'shopping'],
};

const googleTypeCategories = {
  bar: 'bar',
  pub: 'bar',
  wine_bar: 'bar',
  night_club: 'bar',
  tapas_bar: 'tapas',
  restaurant: 'restaurant',
  meal_delivery: 'restaurant',
  meal_takeaway: 'restaurant',
  sushi_restaurant: 'sushi',
  japanese_restaurant: 'sushi',
  ramen_restaurant: 'sushi',
  barbecue_restaurant: 'grill',
  steak_house: 'grill',
  steakhouse: 'grill',
  seafood_restaurant: 'seafood',
  cafe: 'cafe',
  coffee_shop: 'cafe',
  bakery: 'cafe',
  lodging: 'hotel',
  hotel: 'hotel',
  museum: 'culture',
  art_gallery: 'culture',
  tourist_attraction: 'culture',
  park: 'culture',
  shopping_mall: 'shopping',
  store: 'shopping',
  clothing_store: 'shopping',
  book_store: 'shopping',
};

function categoryFromText(value = '') {
  const text = value.toLowerCase();
  if (/\b(tapas|tapeo|pinchos|pintxos)/.test(text)) return 'tapas';
  if (/\b(sushi|japon[eé]s|japones|ramen|omakase|izakaya)/.test(text)) return 'sushi';
  if (/\b(carne|parrilla|asador|asado|steak|grill|barbacoa|bbq)/.test(text)) return 'grill';
  if (/\b(pescado|marisco|marisquer[ií]a|seafood|ceviche)/.test(text)) return 'seafood';
  if (/\b(bar|pub|taberna|bodega|coctel)/.test(text)) return 'bar';
  if (/\b(restaurante|restaurant|brunch)/.test(text)) return 'restaurant';
  if (/\b(café|cafe|coffee|panadería|bakery)/.test(text)) return 'cafe';
  if (/\b(hotel|hostal|alojamiento)/.test(text)) return 'hotel';
  if (/\b(museo|galería|monumento|mirador|parque)/.test(text)) return 'culture';
  if (/\b(tienda|mercado|compras|shopping)/.test(text)) return 'shopping';
  return 'other';
}

export function categoryFromGoogleType(type = '') {
  return googleTypeCategories[type] || 'other';
}

export function getCategoryLabel(category) {
  return categoryOptions.find((option) => option.value === category)?.label || 'Otro';
}

function getCategoryTagLabels(category) {
  const option = categoryOptions.find((candidate) => candidate.value === category);
  return new Set(
    [category, option?.label, ...(categoryTagAliases[category] || [])]
      .filter(Boolean)
      .map((label) => label.toLowerCase()),
  );
}

export function normalizePlaceRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 0;
  return Math.min(5, Math.max(0, Math.round(rating * 2) / 2));
}

export function inferPlaceCategory(place = {}) {
  if (categoryValues.has(place.category)) return place.category;

  const providerTypes = [place.providerType, place.type, ...(place.types || [])].filter(Boolean);
  const providerCategory = providerTypes.map(categoryFromGoogleType).find((category) => category !== 'other');
  if (providerCategory) return providerCategory;

  return categoryFromText([place.name, place.title, ...(place.tags || [])].filter(Boolean).join(' '));
}

export function normalizePlaceTags(tags = [], category = 'other') {
  const categoryLabels = getCategoryTagLabels(category);
  const seen = new Set();

  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key) || statusLabels.has(key) || categoryLabels.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function sanitizePlaceRecord(record = {}) {
  const cleanRecord = { ...record };
  delete cleanRecord.imageUrl;
  delete cleanRecord.notes;
  const category = inferPlaceCategory(cleanRecord);

  return {
    ...cleanRecord,
    category,
    tags: normalizePlaceTags(cleanRecord.tags, category),
  };
}

export function getPlaceRecordMigration(record = {}) {
  const sanitized = sanitizePlaceRecord(record);
  const remove = [];
  const set = {};

  if (Object.prototype.hasOwnProperty.call(record, 'imageUrl')) remove.push('imageUrl');
  if (Object.prototype.hasOwnProperty.call(record, 'notes')) remove.push('notes');
  if (Object.prototype.hasOwnProperty.call(record, 'id')) remove.push('id');
  if (record.category !== sanitized.category) set.category = sanitized.category;
  if (JSON.stringify(record.tags || []) !== JSON.stringify(sanitized.tags)) set.tags = sanitized.tags;

  return { remove, set };
}
