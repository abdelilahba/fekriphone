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
    { path: '/depenses', icon: '💸', label: 'المصاريف', exact: false, roles: ['admin'] },
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
    const seen = localStorage.getItem('update_msg_v1_1_seen');
    if (!seen) {
      setTimeout(async () => {
        await Swal.fire({
          title: '🎉 تحديث جديد في التطبيق!',
          html: `
            <div style="text-align: right; line-height: 1.8; font-size: 15px;">
              <b>شنو الجديد؟</b><br>
              1️⃣ <b>الكريدي فالمبيعات:</b> دابا ملي تبيع شي حاجة، تقدر تكتب شحال عطاك الكليان بالضبط فـ (المبلغ المؤدى)، والباقي غيتسجل كريدي أوتوماتيكيا!<br>
              2️⃣ <b>تسجيل الكليان أوتوماتيك:</b> ملي تبغي تقيد كريدي (سواء فالبيع ولا فصفحة الديون)، يكفي تكتب سميت الكليان. الا ماكانش مسجل غيتسجل بوحدو بلا ما تمشي تزيدو بيدك.<br>
              3️⃣ <b>الحساب د الكاصة مقاد:</b> دابا الكاصة (الفوق) كتحسب غير الفلوس الكاش لي دخلات بصح باش ميوقعش غلط مع الكريدي!
            </div>
          `,
          icon: 'info',
          confirmButtonText: 'فهمت، شكرا! 👍',
          confirmButtonColor: '#9b30ff',
          showCloseButton: true
        });
        localStorage.setItem('update_msg_v1_1_seen', 'true');
      }, 1500); // Wait a bit until layout fully loads
    }
  }

  ngOnDestroy() {
    if (this.statsInterval) clearInterval(this.statsInterval);
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

  openQuickWithdraw() {
    if (this.userRole !== 'admin') return;
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
        date: new Date().toISOString().split('T')[0],
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
