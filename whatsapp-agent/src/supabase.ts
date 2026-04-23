import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// ═══════════════════════════════════════
//  PRODUCT QUERIES
// ═══════════════════════════════════════

export async function getAllProducts(): Promise<any[]> {
  const { data, error } = await supabase
    .from('produits')
    .select('*, categories(nom)')
    .gt('quantite', 0)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function searchProducts(query: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('produits')
    .select('*, categories(nom)')
    .ilike('nom', `%${query}%`)
    .order('quantite', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getProductsByCategory(categoryName: string): Promise<any[]> {
  // First find the category
  const { data: categories } = await supabase
    .from('categories')
    .select('id')
    .ilike('nom', `%${categoryName}%`);

  if (!categories || categories.length === 0) return [];

  const categoryIds = categories.map(c => c.id);
  const { data, error } = await supabase
    .from('produits')
    .select('*, categories(nom)')
    .in('categorie_id', categoryIds)
    .gt('quantite', 0)
    .order('prix_vente', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getCategories(): Promise<any[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('nom');
  if (error) throw error;
  return data || [];
}

// ═══════════════════════════════════════
//  CLIENT / CREDIT QUERIES
// ═══════════════════════════════════════

export async function findClientByPhone(phone: string): Promise<any | null> {
  // Normalize phone — remove +, spaces, etc.
  const normalized = phone.replace(/[\s\-\+]/g, '');
  const variants = [
    normalized,
    normalized.replace(/^212/, '0'),    // +212xxx → 0xxx
    normalized.replace(/^0/, '212'),     // 0xxx → 212xxx
    `+${normalized}`,
  ];

  for (const variant of variants) {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .ilike('telephone', `%${variant.slice(-9)}%`) // Match last 9 digits
      .limit(1);

    if (data && data.length > 0) return data[0];
  }

  return null;
}

export async function getClientCredits(clientId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('credits')
    .select('*, credit_paiements(*)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ═══════════════════════════════════════
//  BUILD CONTEXT FOR AI
// ═══════════════════════════════════════

export async function buildStoreContext(): Promise<string> {
  try {
    const products = await getAllProducts();
    const categories = await getCategories();

    // Group products by category
    const categoryMap: Record<string, any[]> = {};
    for (const p of products) {
      const catName = p.categories?.nom || 'أخرى';
      if (!categoryMap[catName]) categoryMap[catName] = [];
      categoryMap[catName].push(p);
    }

    let context = `📦 المنتجات المتوفرة حاليا:\n\n`;

    for (const [catName, prods] of Object.entries(categoryMap)) {
      context += `── ${catName} ──\n`;
      for (const p of prods) {
        context += `• ${p.nom} — ${p.prix_vente} د.م (متوفر: ${p.quantite})\n`;
      }
      context += '\n';
    }

    // Add categories summary
    context += `\n🏷️ الفئات المتوفرة: ${categories.map(c => c.nom).join('، ')}\n`;

    return context;
  } catch (e) {
    console.error('Error building store context:', e);
    return 'لم نتمكن من تحميل المنتجات حاليا.';
  }
}

export async function buildClientContext(phone: string): Promise<string> {
  try {
    const client = await findClientByPhone(phone);
    if (!client) return '';

    const credits = await getClientCredits(client.id);
    if (credits.length === 0) return `\n👤 الزبون: ${client.nom}\n✅ لا توجد ديون.`;

    const unpaid = credits.filter(c => !c.est_paye);
    const totalDue = unpaid.reduce((s: number, c: any) => s + (c.montant - c.montant_paye), 0);

    let ctx = `\n👤 الزبون: ${client.nom}`;
    if (totalDue > 0) {
      ctx += `\n💰 الديون المتبقية: ${totalDue} د.م`;
      ctx += `\n📋 تفاصيل الديون:`;
      for (const c of unpaid) {
        const reste = c.montant - c.montant_paye;
        ctx += `\n  • ${c.description} — ${reste} د.م (من ${c.montant} د.م)`;
      }
    } else {
      ctx += `\n✅ جميع الديون مخلصة.`;
    }

    return ctx;
  } catch (e) {
    return '';
  }
}

// ═══════════════════════════════════════
//  NOTIFICATION TO ADMIN (TELEGRAM)
// ═══════════════════════════════════════

export async function notifyAdmin(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (e) {
    console.error('Telegram notification failed:', e);
  }
}
