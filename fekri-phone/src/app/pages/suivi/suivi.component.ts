import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { RefreshService } from '../../core/services/refresh.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-suivi',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './suivi.component.html',
  styleUrl: './suivi.component.css'
})
export class SuiviComponent implements OnInit, OnDestroy {
  logs: any[] = [];
  loading = true;
  private refreshSub!: Subscription;

  constructor(private supabase: SupabaseService, private cdr: ChangeDetectorRef, private refreshService: RefreshService) {}

  ngOnInit() {
    this.loadLogs();
    this.refreshSub = this.refreshService.refreshStats$.subscribe(() => {
      this.loadLogs();
    });
  }

  ngOnDestroy() {
    if (this.refreshSub) {
      this.refreshSub.unsubscribe();
    }
  }

  async loadLogs() {
    try {
      this.loading = true;
      this.logs = await this.supabase.getActivityLogs();
      this.cdr.detectChanges();
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  getActionLabel(action: string): string {
    switch (action) {
      case 'BI3A_JADIDA': return 'مبيعة جديدة 🛒';
      case 'MS7_BI3A': return 'حذف مبيعة 🗑️';
      case 'ZID_ISLAH': return 'إصلاح جديد 🔧';
      case 'ZID_MASROUF': return 'مصروف جديد 💸';
      case 'MS7_MASROUF': return 'حذف مصروف 🗑️';
      case 'MS7_ISLAH': return 'حذف إصلاح 🗑️';
      default: return action;
    }
  }

  getActionClass(action: string): string {
    switch (action) {
      case 'BI3A_JADIDA': return 'success';
      case 'MS7_BI3A': return 'danger';
      case 'ZID_ISLAH': return 'info';
      case 'ZID_MASROUF': return 'warning';
      case 'MS7_MASROUF': return 'danger';
      default: return '';
    }
  }
}
