import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { RefreshService } from './refresh.service';
import { SupabaseClientService } from './supabase-client.service';
import { environment } from '../../../environments/environment';
import { DateUtils } from '../utils/date.utils';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private readonly TELEGRAM_QUEUE_KEY = 'telegram_notification_queue';
  private isFlushing = false;

  // Static flag: ensure event listeners are registered only once,
  // even if Angular hot-reloads or re-instantiates this service.
  private static listenersRegistered = false;

  constructor(
    private refreshService: RefreshService,
    supabaseClientService: SupabaseClientService
  ) {
    // Use the shared singleton — do NOT call createClient() here.
    this.supabase = supabaseClientService.client;

    // ─── Offline Queue: flush pending notifications when back online ───
    if (typeof window !== 'undefined' && !SupabaseService.listenersRegistered) {
      SupabaseService.listenersRegistered = true;

      // 1. Standard online event
      window.addEventListener('online', () => {
        console.log('📶 Back online! Flushing queued Telegram notifications...');
        this.flushTelegramQueue();
      });

      // 2. Flush when app becomes visible again (debounced to avoid spam)
      let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          // Debounce: cancel any pending call before scheduling a new one
          if (visibilityTimer) clearTimeout(visibilityTimer);
          visibilityTimer = setTimeout(() => {
            console.log('👀 App visible again, checking Telegram queue...');
            this.flushTelegramQueue();
            visibilityTimer = null;
          }, 1000);
        }
      });

      // 3. Flush on app startup (after 3 seconds)
      setTimeout(() => this.flushTelegramQueue(), 3000);

      // 4. Periodic retry every 30 seconds (catches all edge cases on mobile)
      setInterval(() => {
        if (navigator.onLine) {
          this.flushTelegramQueue();
        }
      }, 30000);
    }
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  // ══════════════════════════════════════════════════
  //  TELEGRAM OFFLINE QUEUE HELPERS
  // ══════════════════════════════════════════════════
  private getTelegramQueue(): { message: string; timestamp: string }[] {
    try {
      const raw = localStorage.getItem(this.TELEGRAM_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  private saveTelegramQueue(queue: { message: string; timestamp: string }[]) {
    try {
      localStorage.setItem(this.TELEGRAM_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save Telegram queue:', e);
    }
  }

  private addToTelegramQueue(message: string) {
    const queue = this.getTelegramQueue();
    queue.push({ message, timestamp: new Date().toISOString() });
    this.saveTelegramQueue(queue);
    console.log(`📥 Notification queued for later (${queue.length} pending)`);
  }

  private async flushTelegramQueue() {
    if (this.isFlushing) return;
    if (!navigator.onLine) return;

    const queue = this.getTelegramQueue();
    if (queue.length === 0) return;

    this.isFlushing = true;
    console.log(`📤 Flushing ${queue.length} queued Telegram notification(s)...`);

    const failed: { message: string; timestamp: string }[] = [];

    for (const item of queue) {
      try {
        const delayedLabel = `\n\n⏰ <i>(إشعار متأخر من ${new Date(item.timestamp).toLocaleTimeString('fr-MA', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' })})</i>`;
        const url = `https://api.telegram.org/bot${environment.telegramBotToken}/sendMessage`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: environment.telegramChatId,
            text: item.message + delayedLabel,
            parse_mode: 'HTML'
          })
        });
        if (!resp.ok) {
          failed.push(item);
        }
      } catch {
        failed.push(item);
      }
    }

    this.saveTelegramQueue(failed);
    this.isFlushing = false;

    if (failed.length > 0) {
      console.warn(`⚠️ ${failed.length} notification(s) still pending.`);
    } else {
      console.log('✅ All queued notifications sent successfully!');
    }
  }

  // ══════════════════════════════════════════════════

  async logActivity(action: string, details: any, userId?: string) {
    try {
      await this.supabase.from('activity_logs').insert({
        user_id: userId,
        action,
        details
      });

      // --- SEND TELEGRAM NOTIFICATION ---
      // If it's an employee (not admin) and Telegram is configured
      const adminId = '370b5904-a1be-4cf2-a6b4-c2e93211cf74';
      if (userId && userId !== adminId && environment.telegramBotToken && environment.telegramChatId) {
        // Fetch employee name
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('name')
          .eq('id', userId)
          .single();

        const userName = profile?.name || 'موظف';
        this.sendTelegramNotification(userName, action, details);
      }

    } catch (e) {
      console.error('Logging error:', e);
    }
  }

  private async sendTelegramNotification(userName: string, action: string, details: any) {
    // ─── Timestamp ───
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-MA', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-MA', { timeZone: 'Africa/Casablanca', day: '2-digit', month: '2-digit', year: 'numeric' });

    // ─── Caisse ───
    let caisseTotal = '';
    try {
      const stats = await this.getDailyQuickStats();
      caisseTotal = `\n━━━━━━━━━━━━━━━━━━\n💵 <b>الصندوق دابا:</b>  <code>${stats.caisse} د.م</code>`;
    } catch (_) {}

    let body = '';
    let emoji = '📣';
    let title = 'إشعار جديد';

    switch (action) {

      /* ═══ NEW SALE ═══ */
      case 'BI3A_JADIDA': {
        emoji = '🛒';
        title = 'بيعة جديدة!';
        let lines = '';
        if (details.items && Array.isArray(details.items) && details.items.length > 0) {
          lines = details.items
            .map((i: any, idx: number) =>
              `${idx + 1}. <b>${i.nom}</b>\n   ${i.quantite} × ${i.prix_unitaire} د.م = <code>${i.quantite * i.prix_unitaire} د.م</code>`)
            .join('\n');
        }
        body = `📋 <b>تفاصيل الفاتورة:</b>\n${lines}\n\n` +
               `━━━━━━━━━━━━━━━━━━\n` +
               `💰 <b>المجموع الإجمالي:</b>  <code>${details.montant} د.م</code>${caisseTotal}`;
        break;
      }

      /* ═══ CANCEL SALE ═══ */
      case 'MS7_BI3A': {
        emoji = '🔄';
        title = 'إلغاء مبيعة';
        body = `⚠️ قام بإلغاء / مسح بيعة سابقة.\n<i>(إرجاع فلوس للزبون)</i>${caisseTotal}`;
        break;
      }

      /* ═══ NEW REPAIR ═══ */
      case 'ZID_ISLAH': {
        emoji = '🔧';
        title = 'إصلاح مُقيَّد';
        body = `📋 <b>الوصف:</b> <i>${details.description || '—'}</i>\n` +
               `━━━━━━━━━━━━━━━━━━\n` +
               `💰 <b>المبلغ:</b>  <code>${details.montant} د.م</code>${caisseTotal}`;
        break;
      }

      /* ═══ CANCEL REPAIR ═══ */
      case 'MS7_ISLAH': {
        emoji = '🔄';
        title = 'إلغاء إصلاح';
        body = `⚠️ قام بإلغاء / مسح إصلاح مسجل.${caisseTotal}`;
        break;
      }

      /* ═══ NEW EXPENSE ═══ */
      case 'ZID_MASROUF': {
        emoji = '💸';
        title = 'مصروف مُسجَّل';
        body = `📋 <b>الوصف:</b> <i>${details.description || '—'}</i>\n` +
               `━━━━━━━━━━━━━━━━━━\n` +
               `💰 <b>المبلغ:</b>  <code>${details.montant} د.م</code>${caisseTotal}`;
        break;
      }

      /* ═══ CANCEL EXPENSE ═══ */
      case 'MS7_MASROUF': {
        emoji = '🔄';
        title = 'إلغاء مصروف';
        body = `⚠️ قام بإلغاء / مسح مصروف مسجل.${caisseTotal}`;
        break;
      }

      /* ═══ NEW AVANCE (دفع) ═══ */
      case 'ZID_AVANCE': {
        emoji = '💰';
        title = 'دفعة جديدة';
        body = `📋 <b>الوصف:</b> <i>${details.description || '—'}</i>\n` +
               `━━━━━━━━━━━━━━━━━━\n` +
               `💰 <b>المبلغ (في الصندوق، ماشي ربح):</b>  <code>${details.montant} د.م</code>${caisseTotal}`;
        break;
      }

      /* ═══ CANCEL AVANCE ═══ */
      case 'MS7_AVANCE': {
        emoji = '🔄';
        title = 'إلغاء دفعة';
        body = `⚠️ قام بإلغاء / مسح دفعة مسجلة.${caisseTotal}`;
        break;
      }

      /* ═══ ANOMALY ALERT ═══ */
      case 'ALERTE_ANOMALIE': {
        emoji = '🚨';
        title = 'تنبيه ANOMALIE';
        body = `${details.alerte_message}\n\n` +
               `━━━━━━━━━━━━━━━━━━\n` +
               `👀 <i>المرجو مراجعة الفاتورة مباشرة.</i>`;
        break;
      }

      /* ═══ CLOTURE CAISSE ═══ */
      case 'CLOTURE_CAISSE': {
        const ecartVal = details.ecart || 0;
        emoji = ecartVal === 0 ? '✅' : '🚨';
        title = 'إقفال الصندوق';
        const ecartLabel = ecartVal === 0 ? '✅ مريڭل 100%' : ecartVal < 0 ? `❌ ناقص ${Math.abs(ecartVal)} د.م` : `💡 زيادة ${ecartVal} د.م`;
        body = `💵 <b>النظري:</b>  <code>${details.montant_theorique} د.م</code>\n` +
               `🏦 <b>الحقيقي:</b>  <code>${details.montant_reel} د.م</code>\n` +
               `━━━━━━━━━━━━━━━━━━\n` +
               `📊 <b>الفرق:</b>  ${ecartLabel}` +
               (details.note ? `\n📝 <b>الملاحظة:</b> <i>${details.note}</i>` : '');
        break;
      }

      /* ═══ LOGIN ═══ */
      case 'LOGIN': {
        emoji = '🔑';
        title = 'دخول للنظام';
        body = `سجّل الدخول للمحل.`;
        break;
      }

      /* ═══ FEEDBACK EMPLOYEE ═══ */
      case 'FEEDBACK_EMPLOYEE': {
        emoji = '📬';
        title = 'رسالة / تقييم من الخدام';
        body = `⭐ <b>التقييم:</b> ${details.rank}/5\n` +
               `💬 <b>الرسالة:</b> <i>${details.text || 'بدون تعليق'}</i>\n` +
               `━━━━━━━━━━━━━━━━━━\n` +
               `هاد الميساج صيفطو من واجهة التواصل.`;
        break;
      }

      default: {
        body = `الحدث: <code>${action}</code>${caisseTotal}`;
      }
    }

    // ─── Compose final message ───
    const message =
      `${emoji} <b>${title}</b>\n` +
      `📅 <i>${dateStr} — ${timeStr}</i>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 الموظف: <b>${userName}</b>\n\n` +
      `${body}`;

    // ─── Send or Queue ───
    try {
      if (!navigator.onLine) {
        throw new Error('Device is offline');
      }
      const url = `https://api.telegram.org/bot${environment.telegramBotToken}/sendMessage`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: environment.telegramChatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      if (!resp.ok) {
        throw new Error(`Telegram API error: ${resp.status}`);
      }
    } catch (e) {
      console.warn('⚠️ Telegram send failed, queuing for retry:', e);
      this.addToTelegramQueue(message);
    }
  }

  async getActivityLogs() {
    const { data, error } = await this.supabase
      .from('activity_logs')
      .select('*, profiles(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  }

  async getFeedbacks() {
    const { data, error } = await this.supabase
      .from('activity_logs')
      .select('*, profiles(name)')
      .eq('action', 'FEEDBACK_EMPLOYEE')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // ==================== Categories ====================
  async getCategories() {
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .order('created_at');
    if (error) throw error;
    return data;
  }

  async addCategorie(nom: string, icone: string = '📦') {
    const { data, error } = await this.supabase
      .from('categories')
      .insert({ nom, icone })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateCategorie(id: string, nom: string, icone: string = '📦') {
    const { data, error } = await this.supabase
      .from('categories')
      .update({ nom, icone })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteCategorie(id: string) {
    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Produits ====================
  async getProduits() {
    const { data, error } = await this.supabase
      .from('produits')
      .select('*, categories(nom)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async getProduitByCodeBarre(codeBarre: string) {
    const { data, error } = await this.supabase
      .from('produits')
      .select('*, categories(nom)')
      .eq('code_barre', codeBarre)
      .single();
    if (error) throw error;
    return data;
  }

  async addProduit(produit: any) {
    const { data, error } = await this.supabase
      .from('produits')
      .insert(produit)
      .select('*')
      .single();
    if (error) throw error;
    // Re-fetch with categories join
    const { data: full, error: e2 } = await this.supabase
      .from('produits').select('*, categories(nom)').eq('id', data.id).single();
    if (e2) return data;
    return full;
  }

  async updateProduit(id: string, produit: any) {
    const { error } = await this.supabase
      .from('produits')
      .update({ ...produit, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    // Re-fetch with categories join
    const { data: full, error: e2 } = await this.supabase
      .from('produits').select('*, categories(nom)').eq('id', id).single();
    if (e2) throw e2;
    return full;
  }

  async deleteProduit(id: string) {
    const { error } = await this.supabase
      .from('produits')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Ventes ====================
  async getVentes() {
    const { data, error } = await this.supabase
      .from('ventes')
      .select('*, profiles!user_id(name), vente_items(*, produits(nom))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addVente(montantTotal: number, montantPaye: number, profitTotal: number, items: any[], userId?: string, dateStr?: string, nomClient?: string) {
    const { data: vente, error: venteError } = await this.supabase
      .from('ventes')
      .insert({
        montant_total: montantTotal,
        montant_paye: montantPaye,
        profit_total: profitTotal,
        user_id: userId,
        nom_client: nomClient || null,
        date: dateStr || DateUtils.getWorkingDate()
      })
      .select()
      .single();
    if (venteError) throw venteError;

    const venteItems = items.map(item => ({
      vente_id: vente.id,
      produit_id: item.produit_id,
      quantite: item.quantite,
      prix_unitaire: item.prix_unitaire,
      prix_achat_unitaire: item.prix_achat_unitaire || 0,
      profit: item.profit || 0,
      sous_total: item.sous_total
    }));

    const { error: itemsError } = await this.supabase
      .from('vente_items')
      .insert(venteItems);
    if (itemsError) throw itemsError;

    // Log the activity with full item details to show in telegram
    await this.logActivity('BI3A_JADIDA', {
      vente_id: vente.id,
      montant: montantTotal,
      items_count: items.length,
      items: items.map((i: any) => ({
        nom: i.nom,
        quantite: i.quantite,
        prix_unitaire: i.prix_unitaire
      }))
    }, userId);

    // --- AGENT DE DÉTECTION D'ANOMALIE ---
    // Runs quietly in background without stopping the sale
    try {
      if (userId !== '370b5904-a1be-4cf2-a6b4-c2e93211cf74') {
        const anomalies: string[] = [];
        items.forEach(item => {
          // 1. Vente à perte (Sold at a loss)
          if (item.prix_achat_unitaire > 0 && item.prix_unitaire < item.prix_achat_unitaire) {
            anomalies.push(`📉 <b>خسارة مالية:</b> باع "${item.nom}" بـ ${item.prix_unitaire} د.م (أقل من ثمن الشراء ${item.prix_achat_unitaire} د.م)`);
          }
          // 2. Grosse remise (Discount > 30%)
          else if (item.prix_original > 0 && item.prix_unitaire <= item.prix_original * 0.7 && item.prix_unitaire > 0) {
            anomalies.push(`✂️ <b>تخفيض كبير:</b> دار تخفيض أكثر من 30% على "${item.nom}" (كان بـ ${item.prix_original} د.م وباعو بـ ${item.prix_unitaire} د.م)`);
          }
          // 3. Vente anormale (Quantité suspecte pour un objet cher)
          if (item.quantite >= 5 && item.prix_unitaire >= 150) {
            anomalies.push(`📦 <b>كمية غير طبيعية:</b> باع ${item.quantite} حبات من "${item.nom}" دقة وحدة!`);
          }
        });

        if (anomalies.length > 0) {
          const combinedMessage = anomalies.join('\n\n');
          // Dispatch anomaly alert without waiting
          this.logActivity('ALERTE_ANOMALIE', { alerte_message: combinedMessage, vente_id: vente.id }, userId).catch(e => console.error(e));
        }
      }
    } catch(err) {
      console.error('Anomaly Detection Agent Failed:', err);
    }

    // Update stock — try the RPC first (atomic), fall back to read-then-write
    for (const item of items) {
      await this.decrementStock(item.produit_id, item.quantite);
    }

    await this.logActivity('BI3A', { montant: montantTotal, items: items.length }, userId);

    this.refreshService.triggerRefresh();
    // Recalculate cloture if transactions were added after closure
    this.recalculateClotureIfExists().catch(() => {});
    return vente;
  }

  async deleteVente(id: string, userId?: string) {
    // 1. Fetch the items for this vente to restore stock
    const { data: items, error: itemsError } = await this.supabase
      .from('vente_items')
      .select('produit_id, quantite, produits(quantite)')
      .eq('vente_id', id);

    if (!itemsError && items) {
      // 2. Restore stock for each product
      for (const item of items) {
        if (item.produit_id && item.produits) {
          const currentStock = (item.produits as any).quantite || 0;
          await this.supabase
            .from('produits')
            .update({ quantite: currentStock + item.quantite })
            .eq('id', item.produit_id);
        }
      }
    }

    // 3. Delete the sale (this will also delete vente_items through cascade if set, otherwise delete them first)
    const { error } = await this.supabase
      .from('ventes')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await this.logActivity('MS7_BI3A', { vente_id: id }, userId);
    this.refreshService.triggerRefresh();
    // Recalculate cloture if transactions were removed after closure
    this.recalculateClotureIfExists().catch(() => {});
  }

  async updateVente(id: string, montantTotal: number, montantPaye: number, profitTotal: number, newItems: any[], userId?: string, dateStr?: string, nomClient?: string) {
    // 1. Fetch old items to restore stock
    const { data: oldItems, error: oldItemsError } = await this.supabase
      .from('vente_items')
      .select('produit_id, quantite, produits(quantite)')
      .eq('vente_id', id);

    if (!oldItemsError && oldItems) {
      for (const item of oldItems) {
        if (item.produit_id && item.produits) {
          const currentStock = (item.produits as any).quantite || 0;
          await this.supabase
            .from('produits')
            .update({ quantite: currentStock + item.quantite })
            .eq('id', item.produit_id);
        }
      }
    }

    // 2. Delete old items
    await this.supabase.from('vente_items').delete().eq('vente_id', id);

    // 3. Update the vente totals
    const updatePayload: any = { montant_total: montantTotal, montant_paye: montantPaye, profit_total: profitTotal, nom_client: nomClient || null };
    if (dateStr) updatePayload.date = dateStr;

    const { error: venteError } = await this.supabase
      .from('ventes')
      .update(updatePayload)
      .eq('id', id);
    if (venteError) throw venteError;

    // 4. Insert new items
    const venteItemsToInsert = newItems.map(item => ({
      vente_id: id,
      produit_id: item.produit_id,
      quantite: item.quantite,
      prix_unitaire: item.prix_unitaire,
      prix_achat_unitaire: item.prix_achat_unitaire || 0,
      profit: item.profit || 0,
      sous_total: item.sous_total
    }));

    const { error: insertError } = await this.supabase.from('vente_items').insert(venteItemsToInsert);
    if (insertError) throw insertError;

    // 5. Decrement stock for new items
    for (const item of newItems) {
      await this.decrementStock(item.produit_id, item.quantite);
    }

    await this.logActivity('MODIF_BI3A', { vente_id: id, montant: montantTotal, items_count: newItems.length }, userId);
    this.refreshService.triggerRefresh();
    // Recalculate cloture if sale was modified after closure
    this.recalculateClotureIfExists().catch(() => {});
  }


  // ==================== Revenus Réparation ====================
  async getRevenus() {
    const { data, error } = await this.supabase
      .from('revenus_reparation')
      .select('*, profiles!user_id(name)')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addRevenu(revenu: any, userId?: string) {
    const { data, error } = await this.supabase
      .from('revenus_reparation')
      .insert({ ...revenu, user_id: userId })
      .select()
      .single();
    if (error) throw error;

    await this.logActivity('ZID_ISLAH', {
      description: revenu.description,
      montant: revenu.montant
    }, userId);

    this.refreshService.triggerRefresh();
    // Recalculate cloture if repair was added after closure
    this.recalculateClotureIfExists().catch(() => {});
    return data;
  }

  async updateRevenu(id: string, revenu: any) {
    const { data, error } = await this.supabase
      .from('revenus_reparation')
      .update(revenu)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    this.refreshService.triggerRefresh();
    return data;
  }

  async deleteRevenu(id: string, userId?: string) {
    const { error } = await this.supabase
      .from('revenus_reparation')
      .delete()
      .eq('id', id);
    if (error) throw error;

    await this.logActivity('MS7_ISLAH', { revenu_id: id }, userId);
    this.refreshService.triggerRefresh();
    // Recalculate cloture if repair was removed after closure
    this.recalculateClotureIfExists().catch(() => {});
  }

  // ==================== Dépenses ====================
  async getDepenses() {
    const { data, error } = await this.supabase
      .from('depenses')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addDepense(depense: any, userId?: string) {
    const { data, error } = await this.supabase
      .from('depenses')
      .insert({ ...depense, user_id: userId })
      .select()
      .single();
    if (error) throw error;

    await this.logActivity('ZID_MASROUF', {
      description: depense.description,
      montant: depense.montant
    }, userId);

    this.refreshService.triggerRefresh();
    // Recalculate cloture if expense was added after closure
    this.recalculateClotureIfExists().catch(() => {});
    return data;
  }

  async updateDepense(id: string, depense: any) {
    const { data, error } = await this.supabase
      .from('depenses')
      .update(depense)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    this.refreshService.triggerRefresh();
    return data;
  }

  async deleteDepense(id: string, userId?: string) {
    const { error } = await this.supabase
      .from('depenses')
      .delete()
      .eq('id', id);
    if (error) throw error;

    await this.logActivity('MS7_MASROUF', { depense_id: id }, userId);
    this.refreshService.triggerRefresh();
    // Recalculate cloture if expense was removed after closure
    this.recalculateClotureIfExists().catch(() => {});
  }

  // ==================== Avances (دفع - Avance sur pièces) ====================
  async getAvances() {
    const { data, error } = await this.supabase
      .from('avances')
      .select('*, profiles!user_id(name)')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addAvance(avance: any, userId?: string) {
    const { data, error } = await this.supabase
      .from('avances')
      .insert({ ...avance, user_id: userId })
      .select()
      .single();
    if (error) throw error;

    await this.logActivity('ZID_AVANCE', {
      description: avance.description,
      montant: avance.montant
    }, userId);

    this.refreshService.triggerRefresh();
    // Recalculate cloture if avance was added after closure
    this.recalculateClotureIfExists().catch(() => {});
    return data;
  }

  async updateAvance(id: string, avance: any) {
    const { data, error } = await this.supabase
      .from('avances')
      .update(avance)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    this.refreshService.triggerRefresh();
    return data;
  }

  async deleteAvance(id: string, userId?: string) {
    const { error } = await this.supabase
      .from('avances')
      .delete()
      .eq('id', id);
    if (error) throw error;

    await this.logActivity('MS7_AVANCE', { avance_id: id }, userId);
    this.refreshService.triggerRefresh();
    // Recalculate cloture if avance was removed after closure
    this.recalculateClotureIfExists().catch(() => {});
  }

  async getCredits(userId?: string) {
    let query = this.supabase
      .from('credits')
      .select('*')
      .order('created_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async addCredit(credit: any, userId?: string) {
    // Default type_credit to 'produit' if not specified
    const creditWithType = {
      ...credit,
      type_credit: credit.type_credit || 'produit'
    };
    const dataToInsert = userId ? { ...creditWithType, user_id: userId } : creditWithType;
    const { data, error } = await this.supabase
      .from('credits')
      .insert(dataToInsert)
      .select()
      .single();
    if (error) throw error;

    await this.logActivity('ZID_CREDIT', { nom: credit.nom_client, montant: credit.montant, type: creditWithType.type_credit }, userId);
    this.refreshService.triggerRefresh();
    return data;
  }

  async updateCredit(id: string, credit: any) {
    const { data, error } = await this.supabase
      .from('credits')
      .update({ ...credit, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    this.refreshService.triggerRefresh();
    return data;
  }

  async deleteCredit(id: string) {
    const { error } = await this.supabase
      .from('credits')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.refreshService.triggerRefresh();
  }

  // ==================== Clients ====================
  async getClients() {
    const { data, error } = await this.supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addClient(client: any) {
    const { data, error } = await this.supabase
      .from('clients')
      .insert(client)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateClient(id: string, client: any) {
    const { data, error } = await this.supabase
      .from('clients')
      .update(client)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteClient(id: string) {
    // 1. Get all credits for this client
    const { data: credits, error: creditsError } = await this.supabase
      .from('credits')
      .select('id')
      .eq('client_id', id);

    if (!creditsError && credits && credits.length > 0) {
      // 2. Delete all credit_paiements for each credit
      const creditIds = credits.map(c => c.id);
      await this.supabase
        .from('credit_paiements')
        .delete()
        .in('credit_id', creditIds);

      // 3. Delete all credits for this client
      await this.supabase
        .from('credits')
        .delete()
        .eq('client_id', id);
    }

    // 4. Finally delete the client
    const { error } = await this.supabase
      .from('clients')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async getClientCredits(clientId: string) {
    const { data, error } = await this.supabase
      .from('credits')
      .select('*, credit_paiements(*)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async getCreditPaiements(creditId: string) {
    const { data, error } = await this.supabase
      .from('credit_paiements')
      .select('*')
      .eq('credit_id', creditId)
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async getAllCreditPaiements() {
    const { data, error } = await this.supabase
      .from('credit_paiements')
      .select('*, credits(nom_client)')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addPaiement(creditId: string, montant: number, date?: string) {
    // 1. Fetch original credit to calculate proportional profit
    const { data: creditDetails, error: creditError } = await this.supabase
      .from('credits')
      .select('vente_montant_total, vente_profit_total')
      .eq('id', creditId)
      .single();

    let profitRealise = 0;
    if (!creditError && creditDetails) {
      const vTotal = Number(creditDetails.vente_montant_total || 0);
      const vProfit = Number(creditDetails.vente_profit_total || 0);
      if (vTotal > 0) {
        profitRealise = vProfit * (montant / vTotal);
      }
    }

    // 2. Insert payment with realized profit
    const { data, error } = await this.supabase
      .from('credit_paiements')
      .insert({
        credit_id: creditId,
        montant: montant,
        date: date || DateUtils.getWorkingDate(),
        profit_realise: profitRealise
      })
      .select()
      .single();
    if (error) throw error;

    await this.logActivity('ADAA_DIN', { credit_id: creditId, montant: montant }, undefined);
    this.refreshService.triggerRefresh();
    return data;
  }

  // ==================== Categories ====================
  async getPertes() {
    const { data, error } = await this.supabase
      .from('pertes')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addPerte(perte: any) {
    const { data, error } = await this.supabase
      .from('pertes')
      .insert(perte)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updatePerte(id: string, perte: any) {
    const { data, error } = await this.supabase
      .from('pertes')
      .update(perte)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deletePerte(id: string) {
    const { error } = await this.supabase
      .from('pertes')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }


  // ══════════════════════════════════════════════════
  //  MONTHLY RECAP NOTIFICATION (بداية الشهر الجديد)
  // ══════════════════════════════════════════════════

  /**
   * Call this once at app startup (admin only).
   * It checks if a monthly recap has already been sent for this month.
   * If not, it fetches last month's stats and fires a Telegram report.
   */
  async checkAndSendMonthlyReport() {
    if (!environment.telegramBotToken || !environment.telegramChatId) return;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const storageKey = `monthly_report_sent_${currentMonthKey}`;

    // Already sent this month? Skip.
    if (localStorage.getItem(storageKey)) return;

    // Mark as sent immediately (avoids double-send on quick reloads)
    localStorage.setItem(storageKey, 'true');

    try {
      await this._sendMonthlyRecapTelegram();
    } catch (e) {
      // If it fails, remove the flag so it retries next time
      localStorage.removeItem(storageKey);
      console.error('Monthly recap failed:', e);
    }
  }

  private async _sendMonthlyRecapTelegram() {
    const now = new Date();

    // ─── Last month date range ───
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonthNum = lastMonthDate.getMonth() + 1; // 1-based

    const startDate = `${lastMonthYear}-${String(lastMonthNum).padStart(2, '0')}-01`;
    const endDay = new Date(lastMonthYear, lastMonthNum, 0).getDate(); // last day of last month
    const endDate = `${lastMonthYear}-${String(lastMonthNum).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    const monthNames: { [key: number]: string } = {
      1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل',
      5: 'ماي', 6: 'يونيو', 7: 'يوليوز', 8: 'غشت',
      9: 'شتنبر', 10: 'أكتوبر', 11: 'نونبر', 12: 'دجنبر'
    };
    const monthLabel = `${monthNames[lastMonthNum]} ${lastMonthYear}`;
    const currentMonthLabel = `${monthNames[now.getMonth() + 1]} ${now.getFullYear()}`;

    // ─── Fetch last month data ───
    const [ventesRes, reparationsRes, depensesRes, avancesRes, creditsRes] = await Promise.all([
      this.supabase.from('ventes').select('montant_total, profit_total').gte('date', startDate).lte('date', endDate),
      this.supabase.from('revenus_reparation').select('montant').gte('date', startDate).lte('date', endDate),
      this.supabase.from('depenses').select('montant').gte('date', startDate).lte('date', endDate),
      this.supabase.from('avances').select('montant').gte('date', startDate).lte('date', endDate),
      this.supabase.from('credits').select('montant').gte('date', startDate).lte('date', endDate),
    ]);

    const totalVentes = (ventesRes.data || []).reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
    const totalProfit = (ventesRes.data || []).reduce((s: number, v: any) => s + Number(v.profit_total || 0), 0);
    const totalReparations = (reparationsRes.data || []).reduce((s: number, r: any) => s + Number(r.montant || 0), 0);
    const totalDepenses = (depensesRes.data || []).reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
    const totalAvances = (avancesRes.data || []).reduce((s: number, a: any) => s + Number(a.montant || 0), 0);
    const totalCredits = (creditsRes.data || []).reduce((s: number, c: any) => s + Number(c.montant || 0), 0);

    const ca = totalVentes + totalReparations;
    const beneficeNet = totalProfit + totalReparations - totalDepenses;
    const nbVentes = (ventesRes.data || []).length;
    const nbReparations = (reparationsRes.data || []).length;

    const beneficeSign = beneficeNet >= 0 ? '+' : '';
    const beneficeEmoji = beneficeNet >= 0 ? '📈' : '📉';

    const message =
      `🗓️ <b>تقرير نهاية الشهر</b>\n` +
      `✨ <i>مبروك، بدا شهر جديد!</i>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📅 <b>ملخص شهر ${monthLabel}</b>\n\n` +
      `🛒 <b>المبيعات:</b>  <code>${totalVentes.toFixed(2)} د.م</code>  <i>(${nbVentes} بيعة)</i>\n` +
      `🔧 <b>الإصلاحات:</b>  <code>${totalReparations.toFixed(2)} د.م</code>  <i>(${nbReparations} إصلاح)</i>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📊 <b>رقم المعاملات (CA):</b>  <code>${ca.toFixed(2)} د.م</code>\n` +
      `💸 <b>المصاريف:</b>  <code>${totalDepenses.toFixed(2)} د.م</code>\n` +
      `📝 <b>الديون المضافة:</b>  <code>${totalCredits.toFixed(2)} د.م</code>\n` +
      `💰 <b>الدفع (Avances):</b>  <code>${totalAvances.toFixed(2)} د.م</code>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${beneficeEmoji} <b>الربح الصافي:</b>  <code>${beneficeSign}${beneficeNet.toFixed(2)} د.م</code>\n\n` +
      `🚀 <b>شهر ${currentMonthLabel} يبدا اليوم — بالتوفيق! 💪</b>`;

    const url = `https://api.telegram.org/bot${environment.telegramBotToken}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: environment.telegramChatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    if (!resp.ok) throw new Error(`Telegram monthly report error: ${resp.status}`);
    console.log('✅ Monthly recap sent to Telegram!');
  }

  // ══════════════════════════════════════════════════
  //  DAILY RECAP TELEGRAM (يتصيفط وقت سدان الصندوق)
  // ══════════════════════════════════════════════════

  /**
   * Called after cloture (cash register close).
   * Sends a full daily recap to Telegram with all totals.
   */
  async sendDailyRecapTelegram(dateStr: string, clotureDetails: {
    montant_theorique: number;
    montant_reel: number;
    ecart: number;
    note?: string;
  }) {
    if (!environment.telegramBotToken || !environment.telegramChatId) return;

    try {
      // Fetch all data for the day
      const [ventesRes, reparationsRes, depensesRes, avancesRes, creditsRes, paiementsRes] = await Promise.all([
        this.supabase.from('ventes').select('montant_total, montant_paye, profit_total').eq('date', dateStr),
        this.supabase.from('revenus_reparation').select('montant').eq('date', dateStr),
        this.supabase.from('depenses').select('montant').eq('date', dateStr),
        this.supabase.from('avances').select('montant').eq('date', dateStr),
        this.supabase.from('credits').select('montant, type_credit').eq('date', dateStr),
        this.supabase.from('credit_paiements').select('montant, profit_realise').eq('date', dateStr),
      ]);

      const totalVentes = (ventesRes.data || []).reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
      const totalMontantPaye = (ventesRes.data || []).reduce((s: number, v: any) => s + Number(v.montant_paye || 0), 0);
      
      // Proportional profit for sales
      const totalProfitReel = (ventesRes.data || []).reduce((s: number, v: any) => {
        const mTotal = Number(v.montant_total || 0);
        const mPaye = Number(v.montant_paye || 0);
        const pTotal = Number(v.profit_total || 0);
        if (mTotal === 0) return s;
        return s + (pTotal * (mPaye / mTotal));
      }, 0);

      const totalReparations = (reparationsRes.data || []).reduce((s: number, r: any) => s + Number(r.montant || 0), 0);
      const totalDepenses = (depensesRes.data || []).reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
      const totalAvances = (avancesRes.data || []).reduce((s: number, a: any) => s + Number(a.montant || 0), 0);
      const totalCredits = (creditsRes.data || []).reduce((s: number, c: any) => s + Number(c.montant || 0), 0);
      const totalCreditsCash = (creditsRes.data || []).filter((c: any) => c.type_credit === 'cash').reduce((s: number, c: any) => s + Number(c.montant || 0), 0);
      
      const totalPaiements = (paiementsRes.data || []).reduce((s: number, p: any) => s + Number(p.montant || 0), 0);
      const totalPaiementsProfit = (paiementsRes.data || []).reduce((s: number, p: any) => s + Number(p.profit_realise || 0), 0);

      const nbVentes = (ventesRes.data || []).length;
      const nbReparations = (reparationsRes.data || []).length;
      const nbDepenses = (depensesRes.data || []).length;

      const caisse = totalMontantPaye + totalReparations + totalAvances + totalPaiements - totalDepenses - totalCreditsCash;
      const benefice = totalProfitReel + totalReparations + totalPaiementsProfit - totalDepenses;

      const now = new Date();
      const timeStr = now.toLocaleTimeString('fr-MA', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' });

      const ecartVal = clotureDetails.ecart || 0;
      const ecartLabel = ecartVal === 0 ? '✅ مريڭل 100%' : ecartVal < 0 ? `❌ ناقص ${Math.abs(ecartVal)} د.م` : `💡 زيادة ${ecartVal} د.م`;

      const message =
        `📋 <b>تقرير يومي — سدان الصندوق</b>\n` +
        `📅 <i>${dateStr} — ${timeStr}</i>\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +

        `🛒 <b>المبيعات:</b>  <code>${totalVentes.toFixed(2)} د.م</code>  <i>(${nbVentes} بيعة)</i>\n` +
        `🔧 <b>الإصلاحات:</b>  <code>${totalReparations.toFixed(2)} د.م</code>  <i>(${nbReparations} إصلاح)</i>\n` +
        `💰 <b>دفع (أربكة):</b>  <code>${totalAvances.toFixed(2)} د.م</code>\n` +
        `✅ <b>أداء الديون:</b>  <code>${totalPaiements.toFixed(2)} د.م</code>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💸 <b>المصاريف:</b>  <code>${totalDepenses.toFixed(2)} د.م</code>  <i>(${nbDepenses})</i>\n` +
        `📝 <b>ديون جداد:</b>  <code>${totalCredits.toFixed(2)} د.م</code>\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +

        `💵 <b>الصندوق النظري:</b>  <code>${clotureDetails.montant_theorique.toFixed(2)} د.م</code>\n` +
        `🏦 <b>الصندوق الحقيقي:</b>  <code>${clotureDetails.montant_reel.toFixed(2)} د.م</code>\n` +
        `📊 <b>الفرق:</b>  ${ecartLabel}\n` +
        (clotureDetails.note ? `📝 <b>ملاحظة:</b> <i>${clotureDetails.note}</i>\n` : '') +
        `━━━━━━━━━━━━━━━━━━\n\n` +

        `${benefice >= 0 ? '📈' : '📉'} <b>الربح الصافي:</b>  <code>${benefice >= 0 ? '+' : ''}${benefice.toFixed(2)} د.م</code>\n` +
        `💵 <b>الصندوق:</b>  <code>${caisse.toFixed(2)} د.م</code>\n\n` +
        `🔒 <i>تم سدان الصندوق بنجاح</i>`;

      const url = `https://api.telegram.org/bot${environment.telegramBotToken}/sendMessage`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: environment.telegramChatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      if (!resp.ok) throw new Error(`Telegram daily report error: ${resp.status}`);
      console.log('✅ Daily recap sent to Telegram!');
    } catch (e) {
      console.error('Daily recap Telegram failed:', e);
    }
  }

  // ==================== Daily Quick Stats (Header) ====================
  async getDailyQuickStats(userId?: string) {
    const today = DateUtils.getWorkingDate();

    // NOTE: We intentionally do NOT return {0,0,0} when a cloture exists.
    // The old logic caused the header stats to show 0 on all devices that
    // didn't have the cloture flag in localStorage (other device, PWA reinstall, etc.).
    // The cloture page manages its own "already closed" UI state independently.

    // Fetch montant_paye (cash actually received) for ventes
    let ventesQuery = this.supabase.from('ventes').select('montant_total, montant_paye, profit_total').eq('date', today);
    let revenusQuery = this.supabase.from('revenus_reparation').select('montant').eq('date', today);
    let depensesQuery = this.supabase.from('depenses').select('montant').eq('date', today);
    let avancesQuery = this.supabase.from('avances').select('montant').eq('date', today);
    // Only subtract CASH credits (money given to client as loan)
    let creditsCashQuery = this.supabase.from('credits').select('montant').eq('date', today).eq('type_credit', 'cash');
    let paiementsQuery = this.supabase.from('credit_paiements').select('montant, profit_realise').eq('date', today);

    if (userId) {
      ventesQuery = ventesQuery.eq('user_id', userId);
      revenusQuery = revenusQuery.eq('user_id', userId);
      depensesQuery = depensesQuery.eq('user_id', userId);
      avancesQuery = avancesQuery.eq('user_id', userId);
      creditsCashQuery = creditsCashQuery.eq('user_id', userId);
    }

    // Note: credit_paiements does not have user_id, it is a global cash inflow when client pays.

    const [ventes, revenus, depenses, avances, creditsCash, paiements] = await Promise.all([
      ventesQuery,
      revenusQuery,
      depensesQuery,
      avancesQuery,
      creditsCashQuery,
      paiementsQuery
    ]);

    // Use montant_paye for caisse (cash actually received), not montant_total
    // Use montant_paye for caisse (cash actually received), not montant_total
    const ventesMontantPaye = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.montant_paye || 0), 0);
    const ventesTotal = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
    
    // Profit proportionnel au cash reçu le jour de la vente
    const ventesProfitReel = (ventes.data || []).reduce((s: number, v: any) => {
      const montantTotal = Number(v.montant_total || 0);
      const montantPaye = Number(v.montant_paye || 0);
      const profitTotal = Number(v.profit_total || 0);
      if (montantTotal === 0) return s;
      return s + (profitTotal * (montantPaye / montantTotal));
    }, 0);

    const reparationsTotal = (revenus.data || []).reduce((s: number, r: any) => s + Number(r.montant || 0), 0);
    const depensesTotal = (depenses.data || []).reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
    const avancesTotal = (avances.data || []).reduce((s: number, a: any) => s + Number(a.montant || 0), 0);
    const creditsCashTotal = (creditsCash.data || []).reduce((s: number, c: any) => s + Number(c.montant || 0), 0);
    const paiementsTotal = (paiements.data || []).reduce((s: number, p: any) => s + Number(p.montant || 0), 0);
    const paiementsProfitTotal = (paiements.data || []).reduce((s: number, p: any) => s + Number(p.profit_realise || 0), 0);

    return {
      caisse: ventesMontantPaye + reparationsTotal + avancesTotal + paiementsTotal - depensesTotal - creditsCashTotal,
      ventes: ventesTotal + reparationsTotal,
      rib7: ventesProfitReel + reparationsTotal + paiementsProfitTotal - depensesTotal
    };
  }

  /**
   * Recalculates the theoretical caisse for a given date and updates
   * the cloture record if one exists. This ensures that transactions
   * added AFTER a cloture are reflected in the cloture history.
   * Fire-and-forget: errors are silently caught.
   */
  async recalculateClotureIfExists(dateStr?: string) {
    try {
      const targetDate = dateStr || DateUtils.getWorkingDate();

      // Check if a cloture exists for this date
      const { data: cloture } = await this.supabase
        .from('clotures_caisse')
        .select('*')
        .eq('date', targetDate)
        .limit(1);

      if (!cloture || cloture.length === 0) return; // No cloture, nothing to update

      const existing = cloture[0];

      // Recalculate theoretical amount from ALL transactions of this day
      const [ventes, revenus, depenses, avances, creditsCash, paiements] = await Promise.all([
        this.supabase.from('ventes').select('montant_paye').eq('date', targetDate),
        this.supabase.from('revenus_reparation').select('montant').eq('date', targetDate),
        this.supabase.from('depenses').select('montant').eq('date', targetDate),
        this.supabase.from('avances').select('montant').eq('date', targetDate),
        this.supabase.from('credits').select('montant').eq('date', targetDate).eq('type_credit', 'cash'),
        this.supabase.from('credit_paiements').select('montant').eq('date', targetDate)
      ]);

      const ventesCash = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.montant_paye || 0), 0);
      const reparationsTotal = (revenus.data || []).reduce((s: number, r: any) => s + Number(r.montant || 0), 0);
      const depensesTotal = (depenses.data || []).reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
      const avancesTotal = (avances.data || []).reduce((s: number, a: any) => s + Number(a.montant || 0), 0);
      const creditsCashTotal = (creditsCash.data || []).reduce((s: number, c: any) => s + Number(c.montant || 0), 0);
      const paiementsTotal = (paiements.data || []).reduce((s: number, p: any) => s + Number(p.montant || 0), 0);

      const newTheorique = ventesCash + reparationsTotal + avancesTotal + paiementsTotal - depensesTotal - creditsCashTotal;

      // Only update if the theoretical amount actually changed
      if (newTheorique !== existing.montant_theorique) {
        const newEcart = existing.montant_reel - newTheorique;
        await this.supabase
          .from('clotures_caisse')
          .update({
            montant_theorique: newTheorique,
            ecart: newEcart,
            note: existing.note
              ? existing.note + ' [محدّث تلقائيا]'
              : '[محدّث تلقائيا بعد إضافة عمليات جديدة]'
          })
          .eq('id', existing.id);

        console.log(`📝 Cloture ${targetDate} updated: ${existing.montant_theorique} → ${newTheorique}`);
      }
    } catch (e) {
      console.warn('recalculateClotureIfExists error (ignored):', e);
    }
  }

  // ==================== Commandes Fournisseur ====================
  async getCommandes() {
    const { data, error } = await this.supabase
      .from('commandes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addCommande(commande: any) {
    const { data, error } = await this.supabase
      .from('commandes')
      .insert(commande)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteCommande(id: string) {
    const { error } = await this.supabase
      .from('commandes')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async updateCommande(id: string, data: any) {
    const { error } = await this.supabase
      .from('commandes')
      .update(data)
      .eq('id', id);
    if (error) throw error;
  }

  async receiveCommande(commandeId: string, articles: { produit_id: string; quantite_recue: number; prix_achat_reel: number }[]) {
    // Update stock for each article
    for (const art of articles) {
      if (art.quantite_recue <= 0) continue;
      // Get current product
      const { data: produit, error: fetchErr } = await this.supabase
        .from('produits')
        .select('quantite, prix_achat')
        .eq('id', art.produit_id)
        .single();
      if (fetchErr) throw fetchErr;

      const newQte = (produit.quantite || 0) + art.quantite_recue;
      const updateData: any = { quantite: newQte, updated_at: new Date().toISOString() };
      // Update prix_achat if provided
      if (art.prix_achat_reel > 0) {
        updateData.prix_achat = art.prix_achat_reel;
      }
      const { error: updErr } = await this.supabase
        .from('produits')
        .update(updateData)
        .eq('id', art.produit_id);
      if (updErr) throw updErr;
    }

    // Mark commande as received
    await this.updateCommande(commandeId, {
      statut: 'recue',
      date_reception: new Date().toISOString()
    });
  }

  // ══════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ══════════════════════════════════════════════════

  /**
   * Decrements product stock by qty.
   * Tries the atomic Supabase RPC first; if it returns 404 (function not created yet),
   * falls back to a safe read-then-write.
   * Run supabase/migrations/001_decrement_stock.sql to install the RPC
   * and eliminate the extra round-trip.
   */
  private async decrementStock(produitId: string, qty: number): Promise<void> {
    const { error } = await this.supabase.rpc('decrement_stock', {
      p_id: produitId,
      p_qty: qty
    });

    if (error) {
      // RPC not installed yet — safe fallback: fetch current stock then subtract
      const { data: prod } = await this.supabase
        .from('produits')
        .select('quantite')
        .eq('id', produitId)
        .single();

      if (prod) {
        const newQty = Math.max(0, (prod.quantite || 0) - qty);
        await this.supabase
          .from('produits')
          .update({ quantite: newQty, updated_at: new Date().toISOString() })
          .eq('id', produitId);
      }
    }
  }
}
