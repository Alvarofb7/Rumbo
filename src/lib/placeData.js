export const categoryOptions = [
  { value: 'bar', label: 'Bar' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'cafe', label: 'Café' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'culture', label: 'Cultura' },
  { value: 'shopping', label: 'Compras' },
  { value: 'other', label: 'Otro' },
];

const categoryValues = new Set(categoryOptions.map((option) => option.value));
const categoryLabels = new Set(categoryOptions.map((option) => option.label.toLowerCase()));
const statusLabels = new Set(['pendiente', 'favorito', 'quiero ir', 'he ido', 'visitado', 'descartado']);

const googleTypeCategories = {
  bar: 'bar',
  pub: 'bar',
  wine_bar: 'bar',
  night_club: 'bar',
  restaurant: 'restaurant',
  meal_delivery: 'restaurant',
  meal_takeaway: 'restaurant',
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
  if (/\b(bar|pub|taberna|bodega|coctel)/.test(text)) return 'bar';
  if (/\b(restaurante|restaurant|tapas|brunch)/.test(text)) return 'restaurant';
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

export function inferPlaceCategory(place = {}) {
  if (categoryValues.has(place.category) && place.category !== 'other') return place.category;

  const providerTypes = [place.providerType, place.type, ...(place.types || [])].filter(Boolean);
  const providerCategory = providerTypes.map(categoryFromGoogleType).find((category) => category !== 'other');
  if (providerCategory) return providerCategory;

  return categoryFromText([place.name, place.title, ...(place.tags || [])].filter(Boolean).join(' '));
}

export function normalizePlaceTags(tags = [], category = 'other') {
  const categoryLabel = getCategoryLabel(category).toLowerCase();
  const seen = new Set();

  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key) || statusLabels.has(key) || categoryLabels.has(key) || key === categoryLabel) return false;
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
  if (record.category !== sanitized.category) set.category = sanitized.category;
  if (JSON.stringify(record.tags || []) !== JSON.stringify(sanitized.tags)) set.tags = sanitized.tags;

  return { remove, set };
}
