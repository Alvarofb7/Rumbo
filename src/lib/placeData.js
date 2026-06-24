export const categoryOptions = [
  { value: 'bar', label: 'Bar' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'cafe', label: 'Cafetería' },
  { value: 'bakery', label: 'Panadería / pastelería' },
  { value: 'market', label: 'Mercado / puesto' },
  { value: 'other', label: 'Otro' },
];

const categoryValues = new Set(categoryOptions.map((option) => option.value));
const statusLabels = new Set(['pendiente', 'favorito', 'quiero ir', 'he ido', 'visitado', 'descartado']);
const categoryTagAliases = {
  bar: ['bar', 'pub', 'taberna', 'bodega'],
  restaurant: ['restaurante', 'restaurant'],
  cafe: ['cafetería', 'cafeteria', 'café', 'cafe', 'coffee'],
  bakery: ['panadería', 'panaderia', 'pastelería', 'pasteleria', 'bakery'],
  market: ['mercado', 'puesto', 'food hall'],
};

const googleTypeCategories = {
  bar: 'bar',
  pub: 'bar',
  wine_bar: 'bar',
  night_club: 'bar',
  tapas_bar: 'bar',
  restaurant: 'restaurant',
  meal_delivery: 'restaurant',
  meal_takeaway: 'restaurant',
  breakfast_restaurant: 'restaurant',
  brunch_restaurant: 'restaurant',
  sushi_restaurant: 'restaurant',
  japanese_restaurant: 'restaurant',
  ramen_restaurant: 'restaurant',
  barbecue_restaurant: 'restaurant',
  steak_house: 'restaurant',
  steakhouse: 'restaurant',
  seafood_restaurant: 'restaurant',
  pizza_restaurant: 'restaurant',
  italian_restaurant: 'restaurant',
  mexican_restaurant: 'restaurant',
  hamburger_restaurant: 'restaurant',
  vegan_restaurant: 'restaurant',
  vegetarian_restaurant: 'restaurant',
  cafe: 'cafe',
  coffee_shop: 'cafe',
  bakery: 'bakery',
  market: 'market',
  food_court: 'market',
};

const googleTypeTags = {
  tapas_bar: ['Tapas'],
  sushi_restaurant: ['Sushi', 'Japonés'],
  japanese_restaurant: ['Japonés'],
  ramen_restaurant: ['Ramen', 'Japonés'],
  barbecue_restaurant: ['Carne', 'Parrilla'],
  steak_house: ['Carne'],
  steakhouse: ['Carne'],
  seafood_restaurant: ['Pescado', 'Marisco'],
  pizza_restaurant: ['Pizza'],
  italian_restaurant: ['Italiano'],
  mexican_restaurant: ['Mexicano'],
  hamburger_restaurant: ['Hamburguesa'],
  vegan_restaurant: ['Vegano'],
  vegetarian_restaurant: ['Vegano'],
  breakfast_restaurant: ['Desayuno'],
  brunch_restaurant: ['Brunch'],
  wine_bar: ['Vino'],
};
const legacyCategoryTags = {
  tapas: ['Tapas'],
  sushi: ['Sushi'],
  grill: ['Carne', 'Parrilla'],
  seafood: ['Pescado', 'Marisco'],
};

function categoryFromText(value = '') {
  const text = value.toLowerCase();
  if (/\b(bar|pub|taberna|bodega|c[oó]ctel(?:er[ií]a)?)\b/.test(text)) return 'bar';
  if (/\b(café|cafe|coffee|cafeter[ií]a)/.test(text)) return 'cafe';
  if (/\b(panader[ií]a|pasteler[ií]a|bakery)/.test(text)) return 'bakery';
  if (/\b(mercado|puesto|food hall)/.test(text)) return 'market';
  if (/\b(restaurante|restaurant|brunch|desayuno|tapas|tapeo|pinchos|pintxos|sushi|japon[eé]s|japones|ramen|omakase|izakaya|carne|parrilla|asador|asado|steak|grill|barbacoa|bbq|pescado|marisco|marisquer[ií]a|seafood|ceviche|pizza|pasta|italian[oa]|mexican[oa]|taco|hamburguesa|burger|vegan[oa]|vegetarian[oa])/.test(text)) return 'restaurant';
  return 'other';
}

export function categoryFromGoogleType(type = '') {
  return googleTypeCategories[type] || 'other';
}

export function tagsFromGoogleTypes(types = []) {
  const seen = new Set();
  return types
    .flatMap((type) => googleTypeTags[type] || [])
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

  return categoryFromText([place.name, place.title, place.category, ...(place.tags || [])].filter(Boolean).join(' '));
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
  const providerTypes = [cleanRecord.providerType, cleanRecord.type, ...(cleanRecord.types || [])].filter(Boolean);

  return {
    ...cleanRecord,
    category,
    tags: normalizePlaceTags([...(legacyCategoryTags[cleanRecord.category] || []), ...(cleanRecord.tags || []), ...tagsFromGoogleTypes(providerTypes)], category),
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
