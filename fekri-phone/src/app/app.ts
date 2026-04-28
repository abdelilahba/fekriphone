import { Component, ChangeDetectorRef, NgZone, OnInit, OnDestroy, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { AuthService } from './core/services/auth.service';
import { SupabaseService } from './core/services/supabase.service';
import { LayoutService } from './core/services/layout.service';
import { RefreshService } from './core/services/refresh.service';
import { AiAssistant } from './components/ai-assistant/ai-assistant';
import { DateUtils } from './core/utils/date.utils';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule, ConfirmDialogComponent, AiAssistant],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit, OnDestroy {
  sidebarOpen = true;
  isFullscreen = false;
  mobileMenuOpen = false;
  showPasswordModal = false;
  newPassword = '';
  confirmPassword = '';
  passwordError = '';
  passwordSuccess = '';
  passwordLoading = false;
  lowStockCount = 0;
  showStockToast = false;
  stockToastMessage = '';

  isDarkMode = false;
  showSearchModal = false;
  searchQuery = '';
  searchResults: any[] = [];
  searchCache: any[] = [];

  userRole = 'admin';
  welcomeMessage = '';
  showHelpModal = false;
  helpTitle = '';
  guideSteps: { icon: string, title: string, desc: string }[] = [];
  isPosModalActive = false;

  // --- PWA Installation ---
  deferredPrompt: any;
  showInstallButton = false;
  isIos = false;
  isInStandaloneMode = false;

  @HostListener('window:beforeinstallprompt', ['$event'])
  onbeforeinstallprompt(e: Event) {
    e.preventDefault();
    this.deferredPrompt = e;
    this.showInstallButton = true;
  }

  checkDeferredPrompt() {
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    this.isIos = /iphone|ipad|ipod/.test(userAgent);
    this.isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator as any).standalone;

    // Show button if on iOS and not installed
    if (this.isIos && !this.isInStandaloneMode) {
      this.showInstallButton = true;
    } 
    // Android / Chrome logic
    else if ((window as any).deferredPromptEvent) {
      this.deferredPrompt = (window as any).deferredPromptEvent;
      this.showInstallButton = true;
    }
  }

  installApp() {
    if (this.isIos && !this.isInStandaloneMode) {
      // iOS doesn't support automatic prompts, so we guide the user manually
      Swal.fire({
        title: 'تثبيت في الآيفون (iOS)',
        html: `
          <div style="font-size: 1.1rem; text-align: right; line-height: 1.8;">
            لتثبيت التطبيق على هاتفك، اتبع هاد الخطوات:
            <br><br>
            1. اضغط على زر <strong>المشاركة (Share)</strong> لتحت <strong><span style="font-size: 24px; color: #007aff;">⍗</span></strong>
            <br>
            2. هبط لتحت واختار <strong>"Sur l'écran d'accueil"</strong> أو <br><strong>"Add to Home Screen"</strong> 📱
          </div>
        `,
        icon: 'info',
        confirmButtonText: 'فهمت',
        confirmButtonColor: 'var(--primary)',
        customClass: { popup: 'swal-ios-pwa' }
      });
    } else if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
          this.showInstallButton = false;
        } else {
          console.log('User dismissed the install prompt');
        }
        this.deferredPrompt = null;
        (window as any).deferredPromptEvent = null;
      });
    }
  }

  // --- Guided Tour (Zoom) ---
  tourActive = false;
  currentTourStep = 0;
  tourSteps: { target: string, title: string, desc: string, side?: 'top' | 'bottom' | 'left' | 'right' }[] = [];
  tourPosition = { top: 0, left: 0, width: 0, height: 0 };
  tourTooltipStyle = {};

  allMenuItems = [
    { path: '/', icon: '📊', label: 'لوحة التحكم', exact: true, roles: ['admin'] },
    { path: '/produits', icon: '📦', label: 'المنتجات', exact: false, roles: ['admin'] },
    { path: '/commandes', icon: '📋', label: 'طلبيات المورد', exact: false, roles: ['admin'] },
    { path: '/pieces', icon: '⚙️', label: 'قطع الغيار', exact: false, roles: ['admin'] },
    { path: '/ventes', icon: '🛒', label: 'المبيعات', exact: false, roles: ['admin', 'employee'] },
    { path: '/reparations', icon: '🔧', label: 'مداخيل الإصلاح', exact: false, roles: ['admin', 'employee'] },
    { path: '/depenses', icon: '💸', label: 'المصاريف', exact: false, roles: ['admin', 'employee'] },
    { path: '/avances', icon: '💰', label: 'دفع (أربكة)', exact: false, roles: ['admin', 'employee'] },
    { path: '/pertes', icon: '💔', label: 'المنتجات التالفة', exact: false, roles: ['admin'] },
    { path: '/credits', icon: '📋', label: 'الديون', exact: false, roles: ['admin', 'employee'] },
    { path: '/clients', icon: '👥', label: 'الزبائن', exact: false, roles: ['admin', 'employee'] },
    { path: '/categories', icon: '🏷️', label: 'الفئات', exact: false, roles: ['admin'] },
    { path: '/suivi', icon: '📡', label: 'مراقبة الموظفين', exact: false, roles: ['admin'] },
    { path: '/cloture', icon: '🔒', label: 'سدان الصندوق', exact: false, roles: ['admin', 'employee'] },
    { path: '/rapport', icon: '📈', label: 'التقرير اليومي', exact: false, roles: ['admin'] },
  ];

  menuItems: any[] = [];

  // --- Global Top Bar Stats ---
  dailyCaisse = 0;
  dailySalesValue = 0;
  dailyRib7 = 0;
  private statsInterval: any;

  constructor(
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private supabase: SupabaseService,
    private layoutService: LayoutService,
    private refreshService: RefreshService,
    private swUpdate: SwUpdate
  ) { }

  ngOnInit() {
    // --- Auto Update PWA (Aggressive) ---
    if (this.swUpdate.isEnabled) {
      // 1. Auto-reload immediately when new version is ready
      this.swUpdate.versionUpdates.pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      ).subscribe(() => {
        console.log('🔄 New version detected, reloading...');
        window.location.reload();
      });

      // 2. Check immediately on load
      this.swUpdate.checkForUpdate();

      // 3. Check every 30 seconds
      setInterval(() => {
        this.swUpdate.checkForUpdate();
      }, 30 * 1000);
    }

    this.auth.user$.subscribe(user => {
      if (user) {
        this.checkLowStock();
        this.loadSearchCache();
        this.loadQuickStats();
        this.showUpdateMessage();

        if (this.statsInterval) clearInterval(this.statsInterval);
        this.statsInterval = setInterval(() => {
          this.loadQuickStats();
        }, 30000); // refresh every 30 seconds
      } else {
        if (this.statsInterval) clearInterval(this.statsInterval);
      }
    });

    this.refreshService.refreshStats$.subscribe(() => {
      this.loadQuickStats();
    });

    // Listen to real-time activity logs to keep everything live!
    this.supabase.client.channel('public:activity_logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, payload => {
        this.ngZone.run(() => {
          this.refreshService.triggerRefresh();
        });
      })
      .subscribe();

    this.auth.userRole$.subscribe(role => {
      this.userRole = role;
      this.menuItems = this.allMenuItems.filter(item => item.roles.includes(role));
      
      if (role !== 'admin') {
        this.lowStockCount = 0;
      }
      
      // Reload stats immediately with the correct role logic
      this.loadQuickStats();

      // ─── Monthly recap: fire once per session when admin role confirmed ───
      if (role === 'admin') {
        setTimeout(() => this.supabase.checkAndSendMonthlyReport(), 5000);
        // ─── Missed cloture reminder ───
        setTimeout(() => this.checkMissedCloture(), 7000);
      }

      // Auto redirect employee to sales page if they try to access root
      if (role === 'employee' && (this.router.url === '/' || this.router.url === '')) {
        this.router.navigate(['/ventes']);
      }
      this.cdr.detectChanges();
    });

    this.auth.userMetadata$.subscribe(meta => {
      if (meta) {
        let name = meta['full_name'] || meta['name'] || 'المعلّم';
        // Force generic names from DB to a nice Darija fallback
        if (['Employé', 'employee', 'khadam', 'خدّام'].includes(name)) {
          name = 'المعلّم';
        }
        
        if (this.userRole === 'employee') {
          this.welcomeMessage = `مرحبا بيك أ سي ${name}! خدمة ميسرة إن شاء الله ✨`;
        } else {
          this.welcomeMessage = `تبارك الله عليك أ سي ${name}! نهارك مبروك 🏁`;
        }
      } else {
        this.welcomeMessage = '';
      }
      this.cdr.detectChanges();
    });

    // Listen for fullscreen mode (POS)
    this.layoutService.fullscreenMode$.subscribe(fs => {
      this.isFullscreen = fs;
      this.cdr.detectChanges();
    });

    this.layoutService.posModalActive$.subscribe(active => {
      this.isPosModalActive = active;
      if (active) {
        const storageKey = `tour_seen_${this.userRole}_pos`;
        if (!localStorage.getItem(storageKey)) {
          setTimeout(() => this.startTour(), 800);
          localStorage.setItem(storageKey, 'true');
        }
      }
      this.cdr.detectChanges();
    });

    // Auto-Tour logic on first visit
    this.router.events.subscribe(event => {
      if (this.tourActive) return; 
      setTimeout(() => {
        const path = this.router.url === '/' ? 'dashboard' : this.router.url.replace('/', '');
        const storageKey = `tour_seen_${this.userRole}_${path}`;
        if (!localStorage.getItem(storageKey)) {
          this.startTour();
          localStorage.setItem(storageKey, 'true');
        }
      }, 1500);
    });

    // Dark Mode Init
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      this.toggleDarkMode(true);
    }
  }

  getRoleLabel(role: string): string {
    return role === 'admin' ? 'معلم 👑' : 'موظف 👤';
  }

  private async showUpdateMessage() {
    // Previous update messages (already seen)
    const seenOld = localStorage.getItem('update_msg_v1_5_pertes_stock');

    // New: Day choice after closure
    const seenNew = localStorage.getItem('update_msg_v2_cloture_day_choice');
    if (!seenNew) {
      setTimeout(async () => {
        await Swal.fire({
          title: '🔒 تحديث جديد — اختيار اليوم بعد سدان الصندوق!',
          html: `
            <div style="text-align: right; line-height: 2.2; font-size: 14px; direction: rtl;">
              <div style="background: linear-gradient(135deg, #e0f2fe, #f0fdf4); border-radius: 12px; padding: 16px; margin-bottom: 14px;">
                <b style="font-size: 15px;">🆕 شنو تبدل فسدان الصندوق؟</b>
              </div>

              <div style="background: #fff; border-right: 4px solid #10b981; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                📅 <b>نسيتي شي حاجة؟ مابقيتيش مشكل!</b><br>
                <span style="color: #555; font-size: 13px;">
                  يلا <b>سديتي الصندوق</b> ولقيتي باللي نسيتي تقيد شي بيعة ولا مصروف ولا إصلاح،
                  دابا السيسطيم <b>غايسولك</b>: واش بغيتي تقيدها فاليوم لي فات (لي عاد سديتي)
                  ولا تبدا فاليوم الجديد.
                </span>
              </div>

              <div style="background: #fff; border-right: 4px solid #3b82f6; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                🧠 <b>السيسطيم ذكي — كيسولك مرة وحدة!</b><br>
                <span style="color: #555; font-size: 13px;">
                  غير تختار <b>مرة وحدة</b> واش بغيتي تخدم فالنهار لي فات ولا الجديد،
                  السيسطيم غايبقى <b>عاقل</b> على الاختيار ديالك ومابقاش يصدعك بالسؤال
                  حتى تسد الصندوق نهار آخر.
                </span>
              </div>

              <div style="background: #fff; border-right: 4px solid #f59e0b; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                🔄 <b>تقدر تبدل رأيك!</b><br>
                <span style="color: #555; font-size: 13px;">
                  إلى بغيتي تبدل الاختيار، سير لصفحة <b>\"سدان الصندوق\"</b>
                  وغاتلقا تماك واحد <b>البوتون</b> لي كيخليك ترجع لليوم لي فات
                  ولا تكمل فاليوم الجديد.
                </span>
              </div>

              <div style="background: #fff; border-right: 4px solid #8b5cf6; border-radius: 8px; padding: 12px;">
                ✅ <b>الحسابات ديما مريكلة!</b><br>
                <span style="color: #555; font-size: 13px;">
                  بهاد الطريقة، <b>حتى حاجة مارادي تقيد فنهار غلط</b>.
                  سواء بيعة، مصروف، إصلاح، عربون، دين ولا خسارة —
                  كولشي غايمشي للبلاصة الصحيحة! 💯
                </span>
              </div>
            </div>
          `,
          icon: 'info',
          confirmButtonText: 'واخا، فهمت! 👍',
          confirmButtonColor: '#10b981',
          showCloseButton: true,
          width: 540
        });
        localStorage.setItem('update_msg_v2_cloture_day_choice', 'true');
      }, 2000);
      return; // Don't show v3 at the same time
    }

    // New v3: Missed cloture catch-up reminder system
    const seenV3 = localStorage.getItem('update_msg_v3_missed_cloture_catchup');
    if (!seenV3) {
      setTimeout(async () => {
        await Swal.fire({
          title: '⏰ تحديث جديد — تذكير الإقفال!',
          html: `
            <div style="text-align: right; line-height: 2.2; font-size: 14px; direction: rtl;">
              <div style="background: linear-gradient(135deg, #fff7ed, #fef3c7); border-radius: 12px; padding: 16px; margin-bottom: 14px;">
                <b style="font-size: 15px;">🆕 شنو تزاد فالسيسطيم؟</b>
              </div>

              <div style="background: #fff; border-right: 4px solid #f59e0b; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                🔔 <b>تذكير أوتوماتيكي!</b><br>
                <span style="color: #555; font-size: 13px;">
                  إذا <b>نسيتي تسد الصندوق</b> شي نهار، فاش غادي تفتح التطبيق
                  السيسطيم <b>غيعلمك أوتوماتيكيا</b> وغيبين ليك اللايستة ديال
                  الأيام اللي ما تسداوش (حتى 7 أيام من قبل!).
                </span>
              </div>

              <div style="background: #fff; border-right: 4px solid #10b981; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                📅 <b>تقدر ترجع تسد أي نهار!</b><br>
                <span style="color: #555; font-size: 13px;">
                  غير تختار <b>الفين نهار بغيتي تسد</b> من القائمة،
                  السيسطيم غيحمل ليك <b>الأرقام ديال داك النهار</b>
                  وتقدر دير الإقفال كأنك مازال فيه!
                </span>
              </div>

              <div style="background: #fff; border-right: 4px solid #3b82f6; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                🏠 <b>بعد ما تسد — ترجع عادي!</b><br>
                <span style="color: #555; font-size: 13px;">
                  بعد ما تسد صندوق اللي نسيتي، السيسطيم <b>غيرجعك
                  للصفحة الرئيسية</b> وتكمل خدمتك فاليوم الجديد
                  بلا أي مشكل. كولشي مريكل!
                </span>
              </div>

              <div style="background: #fff; border-right: 4px solid #8b5cf6; border-radius: 8px; padding: 12px;">
                🙅 <b>مابقاش يصدعك!</b><br>
                <span style="color: #555; font-size: 13px;">
                  التذكير <b>كيبان مرة وحدة فاليوم</b>. إلا قلتي "تابع"
                  مابقاش يعاودها ليك حتى الغد.
                  ولكن <b>الصندوق غيبقى فاللايستة</b> حتى تسدو! 💪
                </span>
              </div>
            </div>
          `,
          icon: 'info',
          confirmButtonText: 'واخا، فهمت! 👍',
          confirmButtonColor: '#f59e0b',
          showCloseButton: true,
          width: 540
        });
        localStorage.setItem('update_msg_v3_missed_cloture_catchup', 'true');
      }, 2000);
    }
  }

  ngOnDestroy() {
    if (this.statsInterval) clearInterval(this.statsInterval);
  }

  /**
   * Checks if any of the last 7 days' cash registers were never closed.
   * Shows a reminder once per session (keyed in localStorage).
   * The user can choose which missed day to close, or dismiss.
   */
  private async checkMissedCloture() {
    const sessionKey = `cloture_reminder_session_${DateUtils.getTodayStr()}`;
    // Already shown this session/day — don't spam
    if (localStorage.getItem(sessionKey)) return;

    try {
      // Build list of last 7 days (excluding today)
      const missedDates: string[] = [];
      for (let i = 1; i <= 7; i++) {
        const d = new Date();
        const tzDate = new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }));
        tzDate.setDate(tzDate.getDate() - i);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dateStr = `${tzDate.getFullYear()}-${pad(tzDate.getMonth() + 1)}-${pad(tzDate.getDate())}`;
        missedDates.push(dateStr);
      }

      // Check database for which of these dates have a cloture
      const { data: closedDates } = await this.supabase['supabase']
        .from('clotures_caisse')
        .select('date')
        .in('date', missedDates);

      const closedSet = new Set((closedDates || []).map((r: any) => r.date));

      // Find missed dates (not closed in DB and not locally marked)
      const unclosed = missedDates.filter(d =>
        !closedSet.has(d) && localStorage.getItem(`cloture_${d}`) !== 'true'
      );

      if (unclosed.length === 0) return;

      // Mark reminder as shown for today's session
      localStorage.setItem(sessionKey, 'true');

      // Build the list HTML for display
      const listHtml = unclosed.map(dateStr => {
        const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('ar-MA', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        return `<li style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">📅 <b>${label}</b></li>`;
      }).join('');

      const titleText = unclosed.length === 1
        ? '⚠️ الصندوق ما تسداش يوم!'
        : `⚠️ ${unclosed.length} أيام الصندوق ما تسداش!`;

      // Build select options for choosing which day to close
      const selectOptions = unclosed.map(dateStr => {
        const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('ar-MA', {
          weekday: 'long', day: 'numeric', month: 'long'
        });
        return `<option value="${dateStr}">${label}</option>`;
      }).join('');

      const selectHtml = unclosed.length > 1
        ? `<div style="margin-top:14px;"><label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">اختار الفين نهار تبغي تسد:</label>
           <select id="missed-date-select" style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid #e5e7eb;font-family:inherit;font-size:14px;">${selectOptions}</select></div>`
        : `<input type="hidden" id="missed-date-select" value="${unclosed[0]}">`;

      const result = await Swal.fire({
        title: titleText,
        html: `
          <div style="text-align: right; direction: rtl; line-height: 1.8; font-size: 14px;">
            <p style="color:#ef4444; font-weight:700; font-size:15px;">الأيام اللي ما تسداش الصندوق:</p>
            <ul style="list-style:none; padding:0; margin:0 0 8px 0; text-align:right;">${listHtml}</ul>
            <p style="color:#6b7280; font-size:13px; margin-top:10px;">
              تقدر ترجع تسد أي نهار من هاد اللايستة.
              <b>بعد ما تسد، تقدر تكمل فاليوم الجديد بلا مشكل.</b>
            </p>
            ${selectHtml}
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '🔒 نرجع نسد صندوق',
        cancelButtonText: '⏭️ تابع باليوم الجديد',
        confirmButtonColor: '#f59e0b',
        cancelButtonColor: '#6b7280',
        allowOutsideClick: false,
        preConfirm: () => {
          const sel = document.getElementById('missed-date-select') as HTMLSelectElement | HTMLInputElement;
          return sel ? sel.value : unclosed[0];
        }
      });

      if (result.isConfirmed && result.value) {
        const chosenDate: string = result.value;
        // Navigate to cloture page with the specific date to close
        this.router.navigate(['/cloture'], { queryParams: { date: chosenDate } });
        setTimeout(() => window.location.reload(), 300);
      }
      // If cancelled — user wants to continue with new day, do nothing
    } catch (e) {
      // Silent fail — don't block app on network error
      console.warn('checkMissedCloture error (ignored):', e);
    }
  }

  async loadQuickStats() {
    try {
      if (this.userRole === 'admin') {
        const stats = await this.supabase.getDailyQuickStats();
        this.dailyCaisse = stats.caisse;
        this.dailyRib7 = stats.rib7;
      } else {
        const uid = this.auth.currentUser?.id;
        if (uid) {
          const stats = await this.supabase.getDailyQuickStats(uid);
          this.dailyCaisse = stats.caisse;
          this.dailySalesValue = (stats as any).ventes || 0;
          this.dailyRib7 = 0; // Employees don't see profit
        }
      }
      this.cdr.detectChanges();
    } catch {}
  }

  toggleDarkMode(forceDark?: boolean) {
    if (forceDark !== undefined) {
      this.isDarkMode = forceDark;
    } else {
      this.isDarkMode = !this.isDarkMode;
    }

    if (this.isDarkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  }

  // --- Help Guide ---
  openGuide() {
    const url = this.router.url;
    this.helpTitle = "دليل الإستخدام 💡";
    this.guideSteps = [];
    
    if (url === '/' || url === '') {
      this.helpTitle = "لوحة التحكم 📊";
      this.guideSteps = [
        { icon: '📈', title: 'الإحصائيات', desc: 'هنا كتشوف شحال بعتي وشحال ربحتي كولشي مجموع ومقاد.' },
        { icon: '🔔', title: 'التنبيهات', desc: 'السيستيم كيعلمك إذا شي حاجة تقادات من المخزن ولا شي كريدي قديم.' },
        { icon: '🗺️', title: 'الرؤية العامة', desc: 'جداول ورسومات بيانية كيبينو ليك الحركة ديال المحل كولا شهر.' }
      ];
    } else if (url.includes('/ventes')) {
      this.helpTitle = "نقطة البيع (لاكيس) 🛒";
      this.guideSteps = [
        { icon: '🔍', title: 'البحث عن منتج', desc: 'كتب غير السمية ولا سكاني الكودبار باش السلعة طيح فالسلة.' },
        { icon: '✏️', title: 'تعديل البيعة', desc: 'تقدر تبدل الثمن ولا دير تخفيض للكليان قبل ما تفاليدي.' },
        { icon: '📠', title: 'طبع التوصيل', desc: 'فاش كتكليكي على بيع، السيستيم كيطبع Ticket أوتوماتيكيا.' }
      ];
    } else if (url.includes('/produits')) {
      this.helpTitle = "إدارة السلعة 📦";
      this.guideSteps = [
        { icon: '➕', title: 'إضافة منتج', desc: 'دخل السلعة الجديدة، ثمن الشرا والبيع، وديك الساعة سكاني الكودبار.' },
        { icon: '📊', title: 'المخزون', desc: 'مراقبة شحال بقى من كولا حاجة باش ما تخواش من السلعة.' },
        { icon: '🏷️', title: 'طبع الباركود', desc: 'إلى السلعة ما فيهاش باركود، تقدر تخرجو وتلصقو عليها بيدك.' }
      ];
    } else if (url.includes('/reparations')) {
      this.helpTitle = "مداخيل الإصلاح 🔧";
      this.guideSteps = [
        { icon: '🛠️', title: 'تقييد إصلاح', desc: 'سجل أي تليفون صاوبتيه وشحال خلص فيه الكليان.' },
        { icon: '💰', title: 'حساب الصاكا', desc: 'السيستيم كيفرق ثمن القطعة على الثمن ديال يديك باش تعرف الربح.' }
      ];
    } else {
      this.guideSteps = [{ icon: '🙌', title: 'مساعدة', desc: "هاد الصفحة باينة، كادير داكشي لي مكتوب فالعنوان ديالها. إلا حتياجيتي مساعدة كتر تواصل مع المطور." }];
    }

    this.showHelpModal = true;
  }

  // --- Guided Tour (Zoom/Focus) Methods ---
  startTour() {
    this.showHelpModal = false;
    this.currentTourStep = 0;
    this.tourActive = true;
    
    const url = this.router.url;
    this.tourSteps = [];

    // 1. Common Global Steps (only on first tour or dashboard)
    if (url === '/' || url === '') {
      if (this.userRole === 'admin') {
        this.tourSteps = [
          { target: 'tour-sidebar', title: 'القائمة الجانبية 🗺️', desc: 'من هنا كدخل لكاع الأقسام ديال السيستيم (سلعة، حسابات، ديون...).', side: 'right' },
          { target: 'tour-stats', title: 'الصندوق والربح 💰', desc: 'هنا كتشوف "الربح" (لي دخلتي فجيبك) و"الصندوق" (لفلوس لي كاينة فالمجير).', side: 'bottom' },
        ];
      } else {
        this.tourSteps = [
          { target: 'tour-sidebar', title: 'القائمة 📜', desc: 'عندك الحق غير تدخل المبيعات والإصلاحات باش تحافظ على خصوصية المحل.', side: 'right' },
          { target: 'tour-welcome', title: 'الترحيب 👋', desc: 'كلمة زوينة باش تبدا نهارك بالنشاط إن شاء الله.', side: 'bottom' },
        ];
      }
    }

    // 2. Page Specific Steps
    if (url.includes('/ventes')) {
      if (this.isPosModalActive) {
        this.tourSteps = [
          { target: 'tour-pos-search', title: 'قلب على السلعة 🔍', desc: 'كتب السمية ولا سكاني الكودبار باش تزيد السلعة للسلة.', side: 'bottom' },
          { target: 'tour-pos-products', title: 'اختار من الليستة 📦', desc: 'تقدر تبرك على أي منتج هنا باش تزيده نيشان.', side: 'top' },
          { target: 'tour-pos-checkout', title: 'سالي البيعة ✅', desc: 'فاش تسالي، برك هنا باش تخرج التيكيت وتنقص السلعة من المخزن.', side: 'top' }
        ];
      } else {
        this.tourSteps.push(
          { target: 'tour-ventes-btn', title: 'بيعة جديدة 🛒', desc: 'كليكي هنا باش تفتح واجهة البيع (POS).', side: 'bottom' },
          { target: 'tour-ventes-total', title: 'شحال بعتي 📈', desc: 'هنا كيبان ليك المجموع ديال المبيعات لي درتي هاد الشهر.', side: 'bottom' }
        );
      }
    } else if (url.includes('/produits') && this.userRole === 'admin') {
      this.tourSteps.push(
        { target: 'tour-prod-add', title: 'دخل سلعة جديدة ➕', desc: 'هنا فين كتزيد المنتجات جداد فالمحل.', side: 'bottom' },
        { target: 'tour-prod-list', title: 'قائمة السلعة 📦', desc: 'هنا كتشوف كاع السلعة لي عندك، الأثمنة، وشحال بقى فالمخزون.', side: 'top' }
      );
    } else if (url.includes('/reparations')) {
      this.tourSteps.push(
        { target: 'tour-rep-add', title: 'قيد إصلاح 🔧', desc: 'سجل أي تليفون صاوبتيه وثمن الخدمة.', side: 'bottom' }
      );
    }

    // Always add help and search at the end
    this.tourSteps.push(
      { target: 'tour-search', title: 'البحث السريع 🔍', desc: 'إلى بغيتي تعرف الثمن ديال شي حاجة بلا ما تبدل الصفحة.', side: 'bottom' },
      { target: 'tour-help', title: 'المساعدة ❓', desc: 'فينما توحل، كليكي هنا السيستيم يشرح ليك كولشي.', side: 'bottom' }
    );

    setTimeout(() => this.updateTourPosition(), 100);
  }

  nextTourStep() {
    if (this.currentTourStep < this.tourSteps.length - 1) {
      this.currentTourStep++;
      this.updateTourPosition();
    } else {
      this.closeTour();
    }
  }

  prevTourStep() {
    if (this.currentTourStep > 0) {
      this.currentTourStep--;
      this.updateTourPosition();
    }
  }

  closeTour() {
    this.tourActive = false;
  }

  resetTours() {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('tour_seen_')) {
        localStorage.removeItem(key);
      }
    });
    window.location.reload();
  }

  updateTourPosition() {
    const step = this.tourSteps[this.currentTourStep];
    const el = document.getElementById(step.target);
    
    if (el) {
      const rect = el.getBoundingClientRect();
      this.tourPosition = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };

      // Calculate Tooltip Position
      let tTop = rect.bottom + 15;
      let tLeft = rect.left + (rect.width / 2) - 130;

      if (step.side === 'right') {
        tTop = rect.top + (rect.height / 2) - 50;
        tLeft = rect.right + 20;
      } else if (step.side === 'top') {
        tTop = rect.top - 150;
      }

      // Keep inside window
      if (tLeft < 10) tLeft = 10;
      if (tLeft + 260 > window.innerWidth) tLeft = window.innerWidth - 270;

      this.tourTooltipStyle = {
        top: tTop + 'px',
        left: tLeft + 'px'
      };
      
      this.cdr.detectChanges();
    } else {
      // If element not found, skip it
      this.nextTourStep();
    }
  }


  closeHelpModal() {
    this.showHelpModal = false;
  }

  // --- Search ---
  async loadSearchCache() {
    try {
      const produits = await this.supabase.getProduits();
      this.searchCache = produits;
    } catch (e) { }
  }

  openSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearchModal = true;
    setTimeout(() => {
      const input = document.getElementById('globalSearchInput');
      if (input) input.focus();
    }, 100);
  }

  closeSearch() {
    this.showSearchModal = false;
  }

  doSearch() {
    if (!this.searchQuery || this.searchQuery.trim().length < 2) {
      this.searchResults = [];
      return;
    }
    const q = this.searchQuery.toLowerCase();
    this.searchResults = this.searchCache.filter(item =>
      (item.nom && item.nom.toLowerCase().includes(q)) ||
      (item.code_barre && item.code_barre.toLowerCase().includes(q))
    ).slice(0, 10);
  }

  goToResult(item: any) {
    this.closeSearch();
    // Navigate based on item logic 
    // Simply to produits page for now
    this.router.navigate(['/produits']);
  }

  async checkLowStock() {
    if (this.userRole !== 'admin') return;
    try {
      const produits = await this.supabase.getProduits();
      const lowStock = produits.filter((p: any) => p.quantite <= 5);
      this.lowStockCount = lowStock.length;
      if (lowStock.length > 0) {
        const outOfStock = lowStock.filter((p: any) => p.quantite === 0).length;
        const lowOnly = lowStock.length - outOfStock;
        let msg = '⚠️ تنبيه المخزن: ';
        if (outOfStock > 0) msg += `${outOfStock} منتج سالي 🔴`;
        if (outOfStock > 0 && lowOnly > 0) msg += ' و ';
        if (lowOnly > 0) msg += `${lowOnly} منتج قليل 🟡`;
        this.stockToastMessage = msg;
        this.showStockToast = true;
        this.cdr.detectChanges();
        setTimeout(() => { this.showStockToast = false; this.cdr.detectChanges(); }, 6000);
      }
    } catch (e) { /* ignore */ }
  }

  get isLoginPage(): boolean {
    return this.router.url === '/login';
  }

  toggleSidebar() { this.sidebarOpen = !this.sidebarOpen; }
  toggleMobileMenu() { this.mobileMenuOpen = !this.mobileMenuOpen; }
  closeMobileMenu() { this.mobileMenuOpen = false; }

  async logout() { await this.auth.signOut(); }

  openPasswordModal() {
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordError = '';
    this.passwordSuccess = '';
    this.showPasswordModal = true;
  }

  closePasswordModal() { this.showPasswordModal = false; }

  async changePassword() {
    this.passwordError = '';
    this.passwordSuccess = '';

    if (!this.newPassword || !this.confirmPassword) {
      this.passwordError = 'خصك تدخل الباسوورد الجديد';
      return;
    }
    if (this.newPassword.length < 6) {
      this.passwordError = 'الباسوورد خصو يكون 6 حروف على الأقل';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'الباسوورد ماشي بحال بحال';
      return;
    }

    this.passwordLoading = true;
    const { error } = await this.auth.updatePassword(this.newPassword);
    this.ngZone.run(() => {
      this.passwordLoading = false;
      if (error) {
        this.passwordError = 'وقع مشكل: ' + error.message;
      } else {
        this.passwordSuccess = 'تبدل الباسوورد بنجاح ✅';
        setTimeout(() => this.closePasswordModal(), 1500);
      }
      this.cdr.detectChanges();
    });
  }

  // --- Quick Withdraw (Expense) from Caisse ---
  showQuickWithdrawModal = false;
  withdrawAmount: number | null = null;
  withdrawReason = '';
  withdrawLoading = false;
  withdrawError = '';

  // --- Feedback ---
  showFeedbackModal = false;
  feedbackRank = 5;
  feedbackText = '';
  feedbackLoading = false;

  openFeedbackModal() {
    this.feedbackRank = 5;
    this.feedbackText = '';
    this.showFeedbackModal = true;
  }

  closeFeedbackModal() {
    this.showFeedbackModal = false;
  }

  async submitFeedback() {
    this.feedbackLoading = true;
    try {
      const uid = this.auth.currentUser?.id;
      await this.supabase.logActivity('FEEDBACK_EMPLOYEE', {
        rank: this.feedbackRank,
        text: this.feedbackText.trim()
      }, uid);
      this.feedbackLoading = false;
      this.closeFeedbackModal();
      Swal.fire({
        title: 'وصلات! ✅',
        text: 'شكرا بزاف على التقييم ديالك والملاحظات!',
        icon: 'success',
        confirmButtonColor: 'var(--primary)',
        confirmButtonText: 'مزيان'
      });
    } catch(e) {
      this.feedbackLoading = false;
    }
  }

  async openQuickWithdraw() {
    if (this.userRole !== 'admin') return;

    if (DateUtils.isClosed() && !DateUtils.hasChoiceBeenMade()) {
      const result = await Swal.fire({
        title: 'الصندوق مسدود!',
        text: 'الصندوق ديال اليوم تسد. واش بغيتي تقيد هاد السحب فاليوم لي فات ولا فاليوم الجديد؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '📅 تقييد فاليوم لي فات',
        cancelButtonText: '🔄 تقييد فاليوم الجديد',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#3b82f6',
        reverseButtons: true
      });
      if (result.isConfirmed) {
        DateUtils.setPreviousDayMode();
        window.location.reload();
        return;
      } else {
        DateUtils.setNewDayMode();
      }
    }

    this.withdrawAmount = null;
    this.withdrawReason = '';
    this.withdrawError = '';
    this.showQuickWithdrawModal = true;
  }

  closeQuickWithdraw() {
    this.showQuickWithdrawModal = false;
  }

  async submitQuickWithdraw() {
    if (!this.withdrawAmount || this.withdrawAmount <= 0) {
      this.withdrawError = 'خصك تدخل شحال خديتي! (أكبر من 0)';
      return;
    }
    if (!this.withdrawReason || this.withdrawReason.trim() === '') {
      this.withdrawError = 'خصك تكتب السبب (مثال: ماكلة، سلعة...)';
      return;
    }

    this.withdrawLoading = true;
    this.withdrawError = '';

    try {
      const depense = {
        date: DateUtils.getWorkingDate(),
        description: this.withdrawReason.trim(),
        montant: this.withdrawAmount,
        categorie: 'سحب سريع ⚡'
      };

      await this.supabase.addDepense(depense);
      await this.loadQuickStats(); // Refresh header immediately
      
      this.withdrawLoading = false;
      this.closeQuickWithdraw();
      
      // Optional: show a toast using Swal or simple alert if preferred, but updating header is enough
    } catch (e: any) {
      this.withdrawLoading = false;
      this.withdrawError = e.message || 'وقع شي مشكل، عاود حاول';
    }
  }
}
