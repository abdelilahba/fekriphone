import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { handleIncomingMessage } from './handler';

dotenv.config();

const logger = pino({ level: 'silent' }); // Suppress Baileys internal logs

// Auth state stored in ./auth_state folder
const AUTH_DIR = path.join(__dirname, '..', 'auth_state');

// Reconnection backoff
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 60000; // 60 seconds max

function getReconnectDelay(): number {
  const delay = Math.min(3000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  return delay;
}

async function startBot() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║  🤖 FekriPhone WhatsApp AI Agent     ║');
  console.log('║  ───────────────────────────────────  ║');
  console.log('║  Powered by Gemini AI + Supabase     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Fetch the latest WhatsApp Web version (fixes 405 errors)
  let version: [number, number, number] | undefined;
  try {
    const versionInfo = await fetchLatestBaileysVersion();
    version = versionInfo.version;
    console.log(`📡 WhatsApp Web version: ${version.join('.')}`);
  } catch (e) {
    console.log('⚠️ Could not fetch latest version, using default');
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock: WASocket = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version, // Use the fetched version
    printQRInTerminal: false,
    logger,
    browser: ['Chrome', 'Windows', '10.0'], // Standard browser identity
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  // ─── Connection Events ───
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('');
      console.log('📱 سكاني هاد QR Code من WhatsApp ديالك:');
      console.log('   (WhatsApp → الأجهزة المرتبطة → ربط جهاز)');
      console.log('');
      qrcode.generate(qr, { small: true });
      console.log('');
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      console.log(
        `❌ انقطع الاتصال (السبب: ${reason}). ${shouldReconnect ? 'إعادة الاتصال...' : 'تم تسجيل الخروج.'}`
      );

      // If 405 or 401 — clear auth state and start fresh
      if (reason === 405 || reason === 401) {
        console.log('🔄 مسح الجلسة القديمة وإعادة الربط...');
        try {
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
        } catch (e) {
          console.error('Error clearing auth state:', e);
        }
        reconnectAttempts = 0;
        setTimeout(() => startBot(), 2000);
        return;
      }

      if (shouldReconnect) {
        const delay = getReconnectDelay();
        console.log(`⏳ إعادة الاتصال بعد ${delay / 1000} ثانية...`);
        setTimeout(() => startBot(), delay);
      } else {
        console.log('🔒 سجل الخروج. حذف auth_state وأعد التشغيل لربط رقم جديد.');
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0; // Reset backoff on success
      console.log('');
      console.log('✅ ══════════════════════════════════════');
      console.log('✅  WhatsApp متصل بنجاح! 🎉');
      console.log('✅  الروبوت خدام ومستعد للرسائل...');
      console.log('✅ ══════════════════════════════════════');
      console.log('');
    }
  });

  // Save auth credentials whenever they update
  sock.ev.on('creds.update', saveCreds);

  // ─── Message Handler ───
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Only process new messages, not history
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip if:
      // 1. Message is from us (outgoing)
      // 2. Message is from a group
      // 3. Message is a status update
      // 4. Message has no text content
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid?.endsWith('@g.us')) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      // Extract text from different message types
      const messageText =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        '';

      if (!messageText.trim()) {
        // If it's a media message without text, acknowledge it
        const mediaType = msg.message?.imageMessage
          ? 'صورة'
          : msg.message?.videoMessage
          ? 'فيديو'
          : msg.message?.audioMessage
          ? 'رسالة صوتية'
          : msg.message?.stickerMessage
          ? 'ستيكر'
          : null;

        if (mediaType) {
          await sock.sendMessage(msg.key.remoteJid!, {
            text: `شكرا على ${mediaType}! 📸 إلا بغيتي تسولني على شي حاجة، صيفط ليا رسالة مكتوبة وأنا نجاوبك. 😊`,
          });
        }
        continue;
      }

      const senderPhone = msg.key.remoteJid!.replace('@s.whatsapp.net', '');
      const senderName = msg.pushName || undefined;

      try {
        // Safe typing indicator
        try {
          await sock.presenceSubscribe(msg.key.remoteJid!);
          await sock.sendPresenceUpdate('composing', msg.key.remoteJid!);
        } catch (e) {
          // ignore presence errors (e.g. connection dropped)
        }

        // Get AI response
        const response = await handleIncomingMessage(senderPhone, messageText, senderName);

        if (response) {
          // Small delay to feel natural
          await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200));

          // Safe stop typing
          try {
            await sock.sendPresenceUpdate('paused', msg.key.remoteJid!);
          } catch (e) {}

          // Send response
          await sock.sendMessage(msg.key.remoteJid!, { text: response });
        }
      } catch (error) {
        console.error('❌ Error handling message:', error);

        // Safe error fallback
        try {
          await sock.sendMessage(msg.key.remoteJid!, {
            text: 'عذرا، وقع مشكل تقني صغير. 🙏 عاود حاول من بعد أو تواصل معنا مباشرة.',
          });
        } catch (fallbackErr) {
           // ignore
        }
      }
    }
  });
}

// ─── Start ───
startBot().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

// ─── Global Error Handlers to prevent crashes ───
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('❌ Unhandled Rejection:', reason?.message || reason);
});

// ─── Graceful Shutdown ───
process.on('SIGINT', () => {
  console.log('\n👋 إيقاف الروبوت...');
  process.exit(0);
});
