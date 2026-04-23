import { getAIResponse } from './ai';
import { buildStoreContext, buildClientContext, searchProducts, notifyAdmin } from './supabase';

// Cache store context (refresh every 5 minutes)
let cachedStoreContext = '';
let lastContextRefresh = 0;
const CONTEXT_TTL = 5 * 60 * 1000; // 5 minutes

async function getStoreContext(): Promise<string> {
  const now = Date.now();
  if (!cachedStoreContext || now - lastContextRefresh > CONTEXT_TTL) {
    cachedStoreContext = await buildStoreContext();
    lastContextRefresh = now;
    console.log('🔄 Store context refreshed');
  }
  return cachedStoreContext;
}

// Rate limiting per user
const userLastMessage = new Map<string, number>();
const RATE_LIMIT_MS = 2000; // 2 seconds between messages

// Track new conversations for admin notification
const knownUsers = new Set<string>();

export async function handleIncomingMessage(
  senderPhone: string,
  messageText: string,
  senderName: string | undefined
): Promise<string> {

  // ─── Rate Limiting ───
  const lastMsg = userLastMessage.get(senderPhone) || 0;
  if (Date.now() - lastMsg < RATE_LIMIT_MS) {
    return ''; // Don't respond to rapid messages
  }
  userLastMessage.set(senderPhone, Date.now());

  // ─── Log ───
  const displayName = senderName || senderPhone;
  console.log(`📩 ${displayName}: "${messageText}"`);

  // ─── Notify admin on FIRST message from a new user ───
  if (!knownUsers.has(senderPhone)) {
    knownUsers.add(senderPhone);
    const adminMsg =
      `🤖 <b>رسالة جديدة على WhatsApp</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>الزبون:</b> ${displayName}\n` +
      `📱 <b>الرقم:</b> ${senderPhone}\n` +
      `💬 <b>الرسالة:</b> <i>${messageText}</i>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🤖 <i>الروبوت كيجاوب أوتوماتيكيا</i>`;
    notifyAdmin(adminMsg).catch(console.error);
  }

  // ─── Build context ───
  const storeContext = await getStoreContext();
  const clientContext = await buildClientContext(senderPhone);

  // ─── Get AI Response ───
  const response = await getAIResponse(messageText, senderPhone, storeContext, clientContext);

  console.log(`🤖 → ${displayName}: "${response.substring(0, 80)}..."`);

  return response;
}
