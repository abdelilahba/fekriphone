import { Component, ChangeDetectorRef, NgZone, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { AuthService } from './core/services/auth.service';
import { SupabaseService } from './core/services/supabase.service';
import { LayoutService } from './core/services/layout.service';
import { AiAssistant } from './components/ai-assistant/ai-assistant';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule, ConfirmDialogComponent, AiAssistant],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit {
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

  menuItems = [
    { path: '/', icon: '📊', label: 'لوحة التحكم', exact: true },
    { path: '/produits', icon: '📦', label: 'المنتجات', exact: false },
    { path: '/commandes', icon: '📋', label: 'طلبيات المورد', exact: false },
    { path: '/pieces', icon: '⚙️', label: 'قطع الغيار', exact: false },
    { path: '/ventes', icon: '🛒', label: 'المبيعات', exact: false },
    { path: '/reparations', icon: '🔧', label: 'مداخيل الإصلاح', exact: false },
    { path: '/depenses', icon: '💸', label: 'المصاريف', exact: false },
    { path: '/pertes', icon: '💔', label: 'المنتجات التالفة', exact: false },
    { path: '/credits', icon: '📋', label: 'الديون', exact: false },
    { path: '/categories', icon: '🏷️', label: 'الفئات', exact: false },
    { path: '/rapport', icon: '📈', label: 'التقرير اليومي', exact: false },
  ];

  constructor(
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private supabase: SupabaseService,
    private layoutService: LayoutService
  ) { }

  ngOnInit() {
    this.auth.user$.subscribe(user => {
      if (user) {
        this.checkLowStock();
        this.loadSearchCache();
      }
    });

    // Listen for fullscreen mode (POS)
    this.layoutService.fullscreenMode$.subscribe(fs => {
      this.isFullscreen = fs;
      this.cdr.detectChanges();
    });

    // Dark Mode Init
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      this.toggleDarkMode(true);
    }
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
}
