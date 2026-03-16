import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RefreshService } from './refresh.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private readonly TELEGRAM_QUEUE_KEY = 'telegram_notification_queue';
  private isFlushing = false;

  constructor(private refreshService: RefreshService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);

    // ─── Offline Queue: flush pending notifications when back online ───
    if (typeof window !== 'undefined') {
      // 1. Standard online event
      window.addEventListener('online', () => {
        console.log('📶 Back online! Flushing queued Telegram notifications...');
        this.flushTelegramQueue();
      });

      // 2. Flush when app becomes visible again (user switches back to app)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          console.log('👀 App visible again, checking Telegram queue...');
          setTimeout(() => this.flushTelegramQueue(), 1000);
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
        const delayedLabel = `\n\n⏰ <i>(إشعار متأخر من ${new Date(item.timestamp).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })})</i>`;
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
    const timeStr = now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });

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
      .select('*, categories(nom)')
      .single();
    if (error) throw error;
    return data;
  }

  async updateProduit(id: string, produit: any) {
    const { data, error } = await this.supabase
      .from('produits')
      .update({ ...produit, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, categories(nom)')
      .single();
    if (error) throw error;
    return data;
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

  async addVente(montantTotal: number, profitTotal: number, items: any[], userId?: string) {
    const { data: vente, error: venteError } = await this.supabase
      .from('ventes')
      .insert({ montant_total: montantTotal, profit_total: profitTotal, user_id: userId })
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

    // Update stock
    for (const item of items) {
      const { error } = await this.supabase.rpc('decrement_stock', {
        p_id: item.produit_id,
        p_qty: item.quantite
      });
      // If RPC doesn't exist, do it manually
      if (error) {
        await this.supabase
          .from('produits')
          .update({ quantite: item.stock_restant })
          .eq('id', item.produit_id);
      }
    }

    this.refreshService.triggerRefresh();
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
  }

  // ==================== Credits ====================
  async getCredits(userId?: string) {
    let query = this.supabase.from('credits').select('*').order('created_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async addCredit(credit: any, userId?: string) {
    const dataToInsert = userId ? { ...credit, user_id: userId } : credit;
    const { data, error } = await this.supabase
      .from('credits')
      .insert(dataToInsert)
      .select()
      .single();
    if (error) throw error;
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
    return data;
  }

  async deleteCredit(id: string) {
    const { error } = await this.supabase
      .from('credits')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Pertes (Produits défectueux) ====================
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

  // ==================== Dashboard Stats ====================
  async getDashboardStats() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [produits, revenus, depenses, credits, ventes, pertes] = await Promise.all([
      this.supabase.from('produits').select('id', { count: 'exact', head: true }),
      this.supabase.from('revenus_reparation').select('montant').gte('date', firstDay).lte('date', lastDay),
      this.supabase.from('depenses').select('montant').gte('date', firstDay).lte('date', lastDay),
      this.supabase.from('credits').select('montant, montant_paye').eq('est_paye', false),
      this.supabase.from('ventes').select('montant_total, profit_total').gte('date', firstDay).lte('date', lastDay),
      this.supabase.from('pertes').select('montant_perte').gte('date', firstDay).lte('date', lastDay)
    ]);

    const totalRevenus = (revenus.data || []).reduce((s: number, r: any) => s + Number(r.montant), 0);
    const totalDepenses = (depenses.data || []).reduce((s: number, d: any) => s + Number(d.montant), 0);
    const totalCredits = (credits.data || []).reduce((s: number, c: any) => s + (Number(c.montant) - Number(c.montant_paye)), 0);
    const totalVentes = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.montant_total), 0);
    const totalProfitVentes = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.profit_total || 0), 0);
    const totalPertes = (pertes.data || []).reduce((s: number, p: any) => s + Number(p.montant_perte), 0);

    return {
      totalProduits: produits.count || 0,
      totalRevenusReparation: totalRevenus,
      totalDepenses: totalDepenses,
      totalCreditsEnCours: totalCredits,
      totalVentes: totalVentes,
      totalPertes: totalPertes,
      benefice: totalProfitVentes + totalRevenus - totalDepenses - totalPertes
    };
  }

  // ==================== Daily Quick Stats (Header) ====================
  async getDailyQuickStats(userId?: string) {
    const today = new Date().toISOString().split('T')[0];
    
    let ventesQuery = this.supabase.from('ventes').select('montant_total, profit_total').eq('date', today);
    let revenusQuery = this.supabase.from('revenus_reparation').select('montant').eq('date', today);
    let depensesQuery = this.supabase.from('depenses').select('montant').eq('date', today);
    let avancesQuery = this.supabase.from('avances').select('montant').eq('date', today);

    if (userId) {
      ventesQuery = ventesQuery.eq('user_id', userId);
      revenusQuery = revenusQuery.eq('user_id', userId);
      // Depenses are optional for employees, but if they make an expense, it should be deducted from their drawer
      depensesQuery = depensesQuery.eq('user_id', userId);
      avancesQuery = avancesQuery.eq('user_id', userId);
    }

    const [ventes, revenus, depenses, avances] = await Promise.all([
      ventesQuery,
      revenusQuery,
      depensesQuery,
      avancesQuery
    ]);

    const ventesTotal = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
    const ventesProfitTotal = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.profit_total || 0), 0);
    const reparationsTotal = (revenus.data || []).reduce((s: number, r: any) => s + Number(r.montant || 0), 0);
    const depensesTotal = (depenses.data || []).reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
    const avancesTotal = (avances.data || []).reduce((s: number, a: any) => s + Number(a.montant || 0), 0);

    return {
      caisse: ventesTotal + reparationsTotal + avancesTotal - depensesTotal,
      rib7: ventesProfitTotal + reparationsTotal - depensesTotal
    };
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
}
