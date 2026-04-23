import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchProducts, getCategories, getAllProducts, findClientByPhone, getClientCredits } from './supabase';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `أنت "فكري" — المساعد الذكي لمحل FekriPhone لبيع وإصلاح الهواتف في المغرب.

═══ شخصيتك ═══
• تتكلم بالدارجة المغربية بطريقة ودية ومهنية
• تستعمل إيموجي بشكل مناسب (ماشي بزاف)
• ترحب بالزبائن وتساعدهم يلقاو داكشي لي بغاو
• أنت خبير فالتيليفونات والإصلاح
• ردودك قصيرة ومفيدة (ماشي paragraphes طوال)

═══ القواعد ═══
1. رد دائما بالدارجة المغربية (ماشي عربية فصحى، ماشي فرنسية إلا الزبون هضر بيها)
2. إلا سولوك على منتج ماكاينش، قول "مكاينش حاليا" واقترح بديل
3. إلا سولوك على الثمن، عطي الثمن من الليستة (prix_vente)
4. ما تعطيش أبدا ثمن الشرا (prix_achat) — هادا سر ديال المحل
5. إلا الزبون بغا يشري أو يحجز، قولو يجي للمحل أو يتصل
6. إلا سولوك على حاجة ماعندكش عليها معلومات، قول بصراحة
7. ما تخترعش أثمنة ولا منتجات ماكايناش فالليستة
8. إلا حد سولك على الدين ديالو، عطيه المعلومات يلا كان معروف بالنوميرو ديالو
9. إلا حد بغا إصلاح، سولو على نوع التيليفون والمشكلة وقولو يجيب للمحل

═══ معلومات المحل ═══
• الاسم: ${process.env.STORE_NAME || 'FekriPhone'}
• العنوان: ${process.env.STORE_ADDRESS || 'العنوان'}
• أوقات العمل: ${process.env.STORE_HOURS || '09:00 - 21:00'}
• الهاتف: ${process.env.STORE_PHONE || 'الرقم'}

═══ الخدمات ═══
• بيع الهواتف الجديدة والمستعملة
• إصلاح جميع أنواع الهواتف (شاشات، بطاريات، برمجة...)
• اكسيسوارات (كوفرات، شواحن، سماعات، حماية شاشة...)
• نظام الدين (الكريدي) متوفر للزبائن المعروفين`;

// Conversation history per user (in-memory, resets on restart)
const conversations = new Map<string, { role: string; parts: { text: string }[] }[]>();
const MAX_HISTORY = 20;

// Models to try in order (fallback chain)
const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

// Track quota status to avoid hammering API
let quotaExhausted = false;
let quotaResetTime = 0;

export async function getAIResponse(
  userMessage: string,
  senderPhone: string,
  storeContext: string,
  clientContext: string
): Promise<string> {

  // If quota was recently exhausted, skip AI and use fallback directly
  if (quotaExhausted && Date.now() < quotaResetTime) {
    console.log('⚡ Quota still exhausted, using smart fallback');
    return await getSmartFallback(userMessage, senderPhone);
  }

  // Try each model in order
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
          topP: 0.9,
        },
      });

      const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n═══ المنتجات المتوفرة الآن ═══\n${storeContext}${clientContext ? `\n\n═══ معلومات الزبون ═══${clientContext}` : ''}`;

      if (!conversations.has(senderPhone)) {
        conversations.set(senderPhone, []);
      }
      const history = conversations.get(senderPhone)!;

      const chat = model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: `[SYSTEM CONTEXT — لا تعرضها للزبون]\n${fullSystemPrompt}` }],
          },
          {
            role: 'model',
            parts: [{ text: 'مرحبا بيك! 👋 أنا فكري، المساعد ديال FekriPhone. كيفاش نقدر نعاونك؟' }],
          },
          ...history,
        ],
      });

      const result = await chat.sendMessage(userMessage);
      const response = result.response.text();

      // Success! Save to history
      history.push(
        { role: 'user', parts: [{ text: userMessage }] },
        { role: 'model', parts: [{ text: response }] }
      );
      while (history.length > MAX_HISTORY * 2) {
        history.shift();
      }

      // Reset quota status on success
      quotaExhausted = false;
      console.log(`✅ AI response via ${modelName}`);
      return response;

    } catch (error: any) {
      const isQuotaError = error.message?.includes('429') || error.message?.includes('quota');

      if (isQuotaError) {
        console.log(`⚠️ Quota exceeded for ${modelName}, trying next...`);
        continue; // Try next model
      }

      console.error(`❌ ${modelName} Error:`, error.message);
      continue; // Try next model on any error
    }
  }

  // All models failed — mark quota as exhausted for 60 seconds
  console.log('🔄 All AI models exhausted. Using smart fallback for 60s...');
  quotaExhausted = true;
  quotaResetTime = Date.now() + 60000; // Retry AI after 60 seconds

  return await getSmartFallback(userMessage, senderPhone);
}

// ═══════════════════════════════════════
//  SMART FALLBACK (No AI needed)
//  Works by keyword matching + Supabase
// ═══════════════════════════════════════

async function getSmartFallback(message: string, senderPhone: string): Promise<string> {
  const msg = message.toLowerCase().trim();

  // ── Greetings ──
  if (/^(salam|slm|bonjour|hi|hello|السلام|مرحبا|صباح|مساء|cv|wlk|hey)/.test(msg)) {
    return `وعليكم السلام! 👋 مرحبا بيك ف ${process.env.STORE_NAME || 'FekriPhone'}!\nكيفاش نقدر نعاونك؟\n\n📱 بيع وإصلاح الهواتف\n⏰ ${process.env.STORE_HOURS || '09:00 - 21:00'}\n📍 ${process.env.STORE_ADDRESS || ''}`;
  }

  // ── Credit/Debt inquiry ──
  if (/din|dine|dette|دين|كريدي|credit|3liya|علي/.test(msg)) {
    try {
      const client = await findClientByPhone(senderPhone);
      if (client) {
        const credits = await getClientCredits(client.id);
        const unpaid = credits.filter(c => !c.est_paye);
        if (unpaid.length === 0) {
          return `✅ مرحبا ${client.nom}! ما عندك حتى دين. كولشي مخلص 👍`;
        }
        const totalDue = unpaid.reduce((s: number, c: any) => s + (c.montant - c.montant_paye), 0);
        let response = `📋 ${client.nom}، عندك ${totalDue} د.م ديال الدين:\n`;
        for (const c of unpaid) {
          const reste = c.montant - c.montant_paye;
          response += `\n• ${c.description} — ${reste} د.م`;
        }
        response += `\n\nمرحبا بيك فالمحل باش تخلص 🙏`;
        return response;
      }
      return `ما لقيتكش فالنظام بهاد الرقم. جرب تجي للمحل باش نتأكدو. 🏪`;
    } catch {
      return `ما قدرتش نشوف المعلومات دابا. جرب من بعد أو جي للمحل. 🙏`;
    }
  }

  // ── Price / Product inquiry ──
  if (/prix|ثمن|تمن|chhal|شحال|combien|bchhal|بشحال|kayn|كاين|wach 3nd|واش عند|disponible/.test(msg)) {
    // Extract product keywords
    const keywords = msg
      .replace(/(prix|ثمن|تمن|chhal|شحال|combien|bchhal|بشحال|kayn|كاين|wach|واش|3nd|عند|dyal|ديال|disponible|de|du|la|le|les|un|une)/gi, '')
      .trim();

    if (keywords.length > 1) {
      try {
        const products = await searchProducts(keywords);
        if (products.length > 0) {
          let response = `📱 هاك اللي لقيت:\n`;
          for (const p of products.slice(0, 5)) {
            const stock = p.quantite > 0 ? `✅ متوفر (${p.quantite})` : '❌ نفد';
            response += `\n• ${p.nom} — ${p.prix_vente} د.م ${stock}`;
          }
          if (products.length > 5) response += `\n\n... و ${products.length - 5} منتجات أخرى`;
          response += `\n\n🏪 مرحبا بيك فالمحل!`;
          return response;
        }
        return `ما لقيت "${keywords}" فالمخزون حاليا 😕\nجرب تسولني على شي حاجة أخرى أو جي للمحل نشوفو ليك. 🏪`;
      } catch {
        return `ما قدرتش نبحث دابا. عاود حاول من بعد. 🙏`;
      }
    }
  }

  // ── General product search (iPhone, Samsung, etc.) ──
  const phoneKeywords = ['iphone', 'samsung', 'huawei', 'xiaomi', 'oppo', 'realme', 'redmi', 'poco', 'nokia', 'honor', 'infinix', 'tecno', 'itel', 'vivo'];
  const foundKeyword = phoneKeywords.find(k => msg.includes(k));

  if (foundKeyword) {
    try {
      const products = await searchProducts(foundKeyword);
      if (products.length > 0) {
        let response = `📱 عندنا هاد ${foundKeyword.charAt(0).toUpperCase() + foundKeyword.slice(1)}:\n`;
        for (const p of products.slice(0, 6)) {
          const stock = p.quantite > 0 ? '✅' : '❌';
          response += `\n${stock} ${p.nom} — ${p.prix_vente} د.م`;
        }
        response += `\n\n🏪 إلا عجبك شي واحد، مرحبا بيك!`;
        return response;
      }
      return `ما عندنا ${foundKeyword} حاليا 😕 جرب تسولني على ماركة أخرى!`;
    } catch {}
  }

  // ── Repair inquiry ──
  if (/islah|إصلاح|repair|répar|ecran|شاشة|batterie|باتري|صاوب|reparation|تصليح|مكسور|casser|tombé|طاح|tombe/.test(msg)) {
    return `🔧 كنصلحو جميع أنواع التيليفونات!\n\n• 📱 تبديل الشاشة\n• 🔋 تبديل الباطري\n• 💾 مشاكل السوفت والبرمجة\n• 🔌 مشاكل الشحن\n• 📷 الكاميرا والسبيكر\n\n👉 جيب التيليفون ديالك للمحل باش نشوفو المشكل ونعطيوك الثمن بالضبط.\n📍 ${process.env.STORE_ADDRESS || ''}\n⏰ ${process.env.STORE_HOURS || '09:00 - 21:00'}`;
  }

  // ── Store info ──
  if (/fin|فين|adresse|عنوان|horaire|وقت|ساعة|heure|ouvert|مفتوح|localisation|map|خريطة/.test(msg)) {
    return `🏪 ${process.env.STORE_NAME || 'FekriPhone'}\n📍 ${process.env.STORE_ADDRESS || 'العنوان'}\n⏰ ${process.env.STORE_HOURS || '09:00 - 21:00'}\n📱 ${process.env.STORE_PHONE || ''}\n\nمرحبا بيك! 😊`;
  }

  // ── Thanks ──
  if (/merci|شكرا|chokran|thanks|thank|بارك/.test(msg)) {
    return `العفو! 😊 إلا حتاجيتي شي حاجة أخرى أنا هنا.\nمرحبا بيك ف ${process.env.STORE_NAME || 'FekriPhone'}! 🏪`;
  }

  // ── Default response ──
  return `مرحبا بيك ف ${process.env.STORE_NAME || 'FekriPhone'}! 👋\n\nكيفاش نقدر نعاونك؟\n\n📱 بيع هواتف — سولني على أي ماركة\n🔧 إصلاح — قولي شنو المشكل\n💰 الدين — سولني على الكريدي ديالك\n📍 المحل — فين وإمتا\n\nغير صيفط ليا شنو بغيتي! 😊`;
}

// Clear conversation history for a user
export function clearConversation(phone: string): void {
  conversations.delete(phone);
}

// Clear all conversations (useful for memory management)
export function clearAllConversations(): void {
  conversations.clear();
}

