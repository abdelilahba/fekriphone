# 🤖 FekriPhone WhatsApp AI Agent
# ═══════════════════════════════

## Comment lancer le bot

### Première fois :
```bash
cd /Users/prodmeat/Desktop/fekriPhone/whatsapp-agent
npm run dev
```

### Ce qui se passe :
1. Le bot démarre et affiche un **QR Code** dans le terminal
2. Ouvre **WhatsApp** sur ton téléphone
3. Va dans **Paramètres → Appareils liés → Lier un appareil**
4. Scanne le QR Code
5. ✅ C'est bon ! Le bot est connecté !

### Après la première fois :
Le bot se reconnecte automatiquement (session sauvegardée dans `auth_state/`)

---

## Comment ça marche

```
Zab Client                    Ton Numéro WhatsApp             FekriPhone Bot
  │                                │                              │
  ├── "wach 3ndkom iPhone?" ──→    │                              │
  │                                ├── Message reçu ──→           │
  │                                │                    ├── Query Supabase (produits)
  │                                │                    ├── Envoie à Gemini AI
  │                                │                    ├── Reçoit réponse IA
  │                                │     ← Réponse ─────┤
  │     ← Réponse WhatsApp ───────│                    │
  │                                │                    ├── Notifie Admin (Telegram)
```

### L'IA sait :
- 📦 Tous les produits disponibles (en temps réel depuis Supabase)
- 💰 Les prix de vente (JAMAIS les prix d'achat)
- 📋 Les crédits/dettes du client (par son numéro de téléphone)
- 🏷️ Les catégories de produits
- 🔧 Les services de réparation

### L'IA fait aussi :
- 💬 Répond en **darija marocaine** naturellement
- ⌨️ Montre "en train d'écrire..." avant de répondre
- ⏱️ Attend 1-2 secondes avant de répondre (naturel, pas robotique)
- 📱 Notifie l'admin sur **Telegram** quand un nouveau client écrit
- 🔄 Cache les produits (refresh toutes les 5 min) pour être rapide
- 📸 Si le client envoie une image/audio, lui dit d'écrire en texte

---

## Exemples de conversations

### Client demande un produit
```
Client: "salam, wach 3ndkom iPhone 14?"
Bot: "وعليكم السلام! 👋 إيه عندنا iPhone 14:
      📱 iPhone 14 - 128GB — 5,500 د.م
      📦 متوفر: 3 حبات
      إلا بغيتي تشريه، مرحبا بيك فالمحل! 🏪"
```

### Client demande les prix
```
Client: "3tini les prix dyal Samsung"
Bot: "هاك أثمنة Samsung لي عندنا:
      📱 Samsung S24 — 8,200 د.م
      📱 Samsung A54 — 3,200 د.م
      📱 Samsung A15 — 1,800 د.م
      كاملين متوفرين! مرحبا بيك 😊"
```

### Client demande sa dette
```
Client: "chhal 3liya dyal dine?"
Bot: "📋 عندك كريدي ديال 1,500 د.م:
      • شاشة iPhone — 800 د.م (بقات 500 د.م)
      • كوفر — 200 د.م
      المجموع: 700 د.م
      يلا بغيتي تخلص، مرحبا بيك فالمحل 🙏"
```

### Client demande une réparation
```
Client: "l'écran dyal iPhone dyali tksser"
Bot: "واخا! 🔧 جيب التيليفون ديالك للمحل باش نشوفو 
      المشكل ونعطيوك الثمن بالضبط.
      📍 العنوان: [adresse du magasin]
      ⏰ أوقات العمل: 09:00 - 21:00"
```

---

## ⚠️ Notes Importantes

1. **Le bot utilise TON numéro WhatsApp** — les clients t'envoient des messages normalement
2. **Le bot ne répond PAS aux groupes** — seulement aux messages privés
3. **Le bot ne répond PAS à tes propres messages** — seulement aux messages entrants
4. **Risque** : WhatsApp peut bloquer le numéro si usage intensif. Pour un usage modéré (< 100 msg/jour), c'est safe.
5. **Pour arrêter le bot** : Ctrl+C dans le terminal

---

## Commandes utiles

```bash
# Lancer en mode développement (avec hot-reload)
npm run dev

# Compiler TypeScript
npm run build

# Lancer la version compilée
npm start

# Reset la session WhatsApp (si problème)
rm -rf auth_state/
```
