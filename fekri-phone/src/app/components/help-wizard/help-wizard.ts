import { Component, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

interface HelpTip {
  path: string;
  title: string;
  message: string;
}

@Component({
  selector: 'app-help-wizard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './help-wizard.html',
  styleUrl: './help-wizard.css'
})
export class HelpWizard implements OnInit {
  showHelp = false;
  currentTip: HelpTip | null = null;
  // Has the user closed this tip? (reset per page if they navigate)
  tipDismissed = false;

  private helpTips: HelpTip[] = [
    {
      path: '/',
      title: '📊 لوحة التحكم (الرئيسية)',
      message: 'هنا غادي تلقا خلاصة سريعة على المحل. شحال دخلتي اليوم، شحال المنتجات اللي غاتسالي من المخزن، و المبيعات في آخر الأيام.'
    },
    {
      path: '/produits',
      title: '📦 المنتجات (الهواتف والإكسسوارات)',
      message: 'من هنا كدخل السلعة الجديدة. كليكي على "اضافة منتج جديد" باش تدخل سميتو، ثمن البيع والشراء وشحال حبة عندك.'
    },
    {
      path: '/ventes',
      title: '🛒 المبيعات (نقطة البيع - الكيشي)',
      message: 'هنا فين كتدوز البيعات للزبناء. كليكي على "بيعة جديدة" باش تفتح الماكينة، ومن بعد اختار المنتج أو قلب عليه، زيد الكمية و دير "تأكيد" باش تسجل البيعة.'
    },
    {
      path: '/pieces',
      title: '🔧 قطع الغيار',
      message: 'نفس نظام المنتجات، ولكن خاص غير بـ"البياس" (Ecrans, Batteries, Connecteurs...). باش تفرز الخردة على السلعة الجديدة.'
    },
    {
      path: '/reparations',
      title: '🔧 مداخيل الإصلاح (الريكلاماسيون)',
      message: 'أي تيليفون صايبتيه لشي كليان دخل الرباح ديالو هنا. هاد الدخل كيتزاد مع أرباح المحل اليومية.'
    },
    {
      path: '/depenses',
      title: '💸 المصاريف (الخسائر)',
      message: 'كاع داكشي اللي كتخسرو (شراء سلعة، كرا المحل، ضو، ماء، شارجونات...). ضروري تقيدهم باش يبان لك الربح الصافي للريال'
    },
    {
      path: '/credits',
      title: '📝 الكريدي (الديون)',
      message: 'الكليان اللي بقا كيسايلك أو بقى خاصو الفلوس، كتسجلو هنا مع نمرتو. ملي يرد الفلوس كليكي على "خلص" باش تنقص من الكريدي.'
    },
    {
      path: '/rapport',
      title: '📊 التقرير اليومي',
      message: 'في نهاية النهار، دخل هنا باش تشوف شحال خصو يكون عندك في الصندوق، وشحال دخلتي، والربح الصافي باش تقارن حسابك.'
    }
  ];

  constructor(private router: Router, private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    // Check local storage so we don't annoy experts too much (optional feature)
    // if (localStorage.getItem('hideHelpWizard') === 'true') return;

    this.checkRoute(this.router.url);

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.tipDismissed = false; // Reset dismiss state on new page
      this.checkRoute(event.urlAfterRedirects);
    });
  }

  checkRoute(url: string) {
    const tip = this.helpTips.find(t => url.startsWith(t.path) && t.path !== '/' || (t.path === '/' && url === '/'));
    if (tip && !this.tipDismissed) {
      this.currentTip = tip;
      this.showHelp = true;
    } else {
      this.showHelp = false;
    }
    this.cdr.detectChanges();
  }

  closeHelp() {
    this.showHelp = false;
    this.tipDismissed = true;
  }
}
