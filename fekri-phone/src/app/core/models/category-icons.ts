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
    image: 'assets/categories/smartphone.png',
    svg: `...` },

  { id: 'iphone', label: 'iPhone', labelAr: 'آيفون', color: '#6366f1',
    image: 'assets/categories/iphone.png',
    svg: `...` },

  { id: 'case', label: 'Cases / Coques', labelAr: 'بوشيطات وكفرات (Pochettes)', color: '#ec4899',
    image: 'assets/categories/case.png',
    svg: `...` },

  { id: 'screen-protector', label: 'Anti-casse', labelAr: 'حماية الشاشة (أنتي كاس، جيلاتين)', color: '#14b8a6',
    image: 'assets/categories/screen-protector.png',
    svg: `...` },

  { id: 'charger', label: 'Chargeurs', labelAr: 'شواحن (شارجورات كوامل / روسان)', color: '#f59e0b',
    image: 'assets/categories/charger.png',
    svg: `...` },

  { id: 'cable', label: 'Câbles USB', labelAr: 'كابلات (Type-C, iPhone, V8)', color: '#64748b',
    image: 'assets/categories/cable.png',
    svg: `...` },

  { id: 'earphone', label: 'Écouteurs', labelAr: 'أكسسوارات هواتف (Accessoires)', color: '#8b5cf6',
    image: 'assets/categories/earphone.png',
    svg: `...` },

  { id: 'speaker', label: 'Haut-parleurs', labelAr: 'بافلات وبافات بلوتوث', color: '#06b6d4',
    image: 'assets/categories/speaker.png',
    svg: `...` },

  { id: 'memory', label: 'Cartes SD / USB', labelAr: 'كارط ميموار وكلي USB', color: '#10b981',
    image: 'assets/categories/memory.png',
    svg: `...` },

  { id: 'watch', label: 'Smartwatch', labelAr: 'ماڭانات ذكية (Smartwatch / براسلي)', color: '#f97316',
    image: 'assets/categories/watch.png',
    svg: `...` },

  { id: 'repair', label: 'Réparations', labelAr: 'ماطريال الصيانة (كاوية، لاصق، تورنوفيس)', color: '#ef4444',
    image: 'assets/categories/repair.png',
    svg: `...` },

  { id: 'battery', label: 'Batteries', labelAr: 'بطاريات وباور بانك (Powerbank)', color: '#22c55e',
    image: 'assets/categories/battery.png',
    svg: `...` },

  { id: 'tablet', label: 'PC & Accessoires', labelAr: 'حواسيب وأكسسوارات', color: '#0ea5e9',
    image: 'assets/categories/tablet.png',
    svg: `...` },

  { id: 'accessories', label: 'Routeur / Wifi', labelAr: 'راوتر / ويفي 4G/5G', color: '#a855f7',
    image: 'assets/categories/accessories.png',
    svg: `...` },

  { id: 'support', label: 'Ring Light / Trépied', labelAr: 'رينغ لايت / تريپود للـ TikTok', color: '#78716c',
    image: 'assets/categories/support.png',
    svg: `...` },

  { id: 'powerbank', label: 'Powerbank', labelAr: 'بطاريات خارجية (Powerbank)', color: '#e11d48',
    image: 'assets/categories/powerbank.png',
    svg: `...` },

  { id: 'gaming', label: 'Gaming', labelAr: 'ألعاب (مانيطات، كاسك ڭايمينڭ...)', color: '#dc2626',
    image: 'assets/categories/gaming.png',
    svg: `...` },

  { id: 'car', label: 'Accessoires voiture', labelAr: 'أكسسوارات سيارات (سيبورة، طرونسميتور)', color: '#0891b2',
    image: 'assets/categories/car.png',
    svg: `...` },

  { id: 'sim', label: 'Cartes SIM', labelAr: 'بطاقات SIM', color: '#4f46e5',
    image: 'assets/categories/sim.png',
    svg: `...` },

  { id: 'iptv', label: 'IPTV / Abonnements', labelAr: 'إشتراكات IPTV (سيرفرات)', color: '#2563eb',
    image: 'assets/categories/iptv.png',
    svg: `...` },

  { id: 'motherboard', label: 'Cartes Mères', labelAr: 'لوحات الأم (Carte Mère)', color: '#059669',
    image: 'assets/categories/motherboard.png',
    svg: `...` },

  { id: 'spare-parts', label: 'Pièces de Rechange', labelAr: 'قطع الغيار (أفيشور، كونيكتور...)', color: '#4b5563',
    image: 'assets/categories/spare-parts.png',
    svg: `...` },

  { id: 'microphone', label: 'Microphones', labelAr: 'ميكروفونات (Streamers)', color: '#f43f5e',
    image: 'assets/categories/microphone.png',
    svg: `...` },

  { id: 'other', label: 'Autres', labelAr: 'أخرى (منوعات)', color: '#71717a',
    image: 'assets/categories/other.png',
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

// Helper to get image path by ID or handle legacy emojis
export function resolveCategoryImage(iconeStr: string): string {
  if (!iconeStr) return 'assets/categories/other.png';
  if (iconeStr.startsWith('assets/')) return iconeStr;
  
  // Map existing emojis to pro images
  const map: { [key: string]: string } = {
    '📲': 'assets/categories/smartphone.png',
    '⚡': 'assets/categories/charger.png',
    '🔌': 'assets/categories/cable.png',
    '🔋': 'assets/categories/battery.png',
    '🛡️': 'assets/categories/case.png',
    '💎': 'assets/categories/screen-protector.png',
    '⌚': 'assets/categories/watch.png',
    '🚘': 'assets/categories/car.png',
    '💾': 'assets/categories/memory.png',
    '🎧': 'assets/categories/accessories.png',
    '💻': 'assets/categories/tablet.png',
    '🎮': 'assets/categories/gaming.png',
    '📸': 'assets/categories/support.png',
    '🔊': 'assets/categories/speaker.png',
    '⚙️': 'assets/categories/spare-parts.png',
    '🛠️': 'assets/categories/spare-parts.png',
    '🧩': 'assets/categories/motherboard.png',
    '🧠': 'assets/categories/motherboard.png',
    '📡': 'assets/categories/iptv.png',
    '🎤': 'assets/categories/microphone.png',
    '📦': 'assets/categories/other.png',
  };
  return map[iconeStr] || 'assets/categories/other.png';
}
