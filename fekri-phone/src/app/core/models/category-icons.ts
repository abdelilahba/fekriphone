// Professional SVG icons for phone store categories
// Each icon is a simple, modern SVG string (Lucide-style)
// Now includes real product images for premium display

export interface CategoryIconOption {
  id: string;
  label: string;
  labelAr: string;
  svg: string;
  color: string;
  image: string; // Path to real product image
}

export const CATEGORY_ICONS: CategoryIconOption[] = [
  { id: 'smartphone', label: 'Smartphones', labelAr: 'هواتف ذكية (جديد ومستعمل)', color: '#3b82f6',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'iphone', label: 'iPhone', labelAr: 'آيفون', color: '#6366f1',
    image: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'case', label: 'Cases / Coques', labelAr: 'بوشيطات وكفرات (Pochettes)', color: '#ec4899',
    image: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'screen-protector', label: 'Anti-casse', labelAr: 'حماية الشاشة (أنتي كاس، جيلاتين)', color: '#14b8a6',
    image: 'https://images.unsplash.com/photo-1609692814858-f7cd2f0afa4f?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'charger', label: 'Chargeurs', labelAr: 'شواحن (شارجورات كوامل / روسان)', color: '#f59e0b',
    image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'cable', label: 'Câbles USB', labelAr: 'كابلات (Type-C, iPhone, V8)', color: '#64748b',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'earphone', label: 'Écouteurs', labelAr: 'أكسسوارات هواتف (Accessoires)', color: '#8b5cf6',
    image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'speaker', label: 'Haut-parleurs', labelAr: 'بافلات وبافات بلوتوث', color: '#06b6d4',
    image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'memory', label: 'Cartes SD / USB', labelAr: 'كارط ميموار وكلي USB', color: '#10b981',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'watch', label: 'Smartwatch', labelAr: 'ماڭانات ذكية (Smartwatch / براسلي)', color: '#f97316',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'repair', label: 'Réparations', labelAr: 'ماطريال الصيانة (كاوية، لاصق، تورنوفيس)', color: '#ef4444',
    image: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'battery', label: 'Batteries', labelAr: 'بطاريات وباور بانك (Powerbank)', color: '#22c55e',
    image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'tablet', label: 'PC & Accessoires', labelAr: 'حواسيب وأكسسوارات', color: '#0ea5e9',
    image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'accessories', label: 'Routeur / Wifi', labelAr: 'راوتر / ويفي 4G/5G', color: '#a855f7',
    image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'support', label: 'Ring Light / Trépied', labelAr: 'رينغ لايت / تريپود للـ TikTok', color: '#78716c',
    image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'powerbank', label: 'Powerbank', labelAr: 'بطاريات خارجية (Powerbank)', color: '#e11d48',
    image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'gaming', label: 'Gaming', labelAr: 'ألعاب (مانيطات، كاسك ڭايمينڭ...)', color: '#dc2626',
    image: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'car', label: 'Accessoires voiture', labelAr: 'أكسسوارات سيارات (سيبورة، طرونسميتور)', color: '#0891b2',
    image: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'sim', label: 'Cartes SIM', labelAr: 'بطاقات SIM', color: '#4f46e5',
    image: 'https://images.unsplash.com/photo-1601972599748-30f4edc5b8e4?w=200&h=200&fit=crop',
    svg: `...` },

  { id: 'other', label: 'Autres', labelAr: 'أخرى (منوعات)', color: '#71717a',
    image: 'https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=200&h=200&fit=crop',
    svg: `...` },
];

// Helper to get SVG by ID
export function getCategoryIconSvg(id: string): string {
  const icon = CATEGORY_ICONS.find(i => i.id === id);
  return icon?.svg || CATEGORY_ICONS[CATEGORY_ICONS.length - 1].svg; // default: 'other'
}

// Helper to get color by ID
export function getCategoryIconColor(id: string): string {
  const icon = CATEGORY_ICONS.find(i => i.id === id);
  return icon?.color || CATEGORY_ICONS[CATEGORY_ICONS.length - 1].color;
}

// Helper to get image path by ID
export function getCategoryImage(id: string): string {
  const icon = CATEGORY_ICONS.find(i => i.id === id);
  return icon?.image || CATEGORY_ICONS[CATEGORY_ICONS.length - 1].image;
}
