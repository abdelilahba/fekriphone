import { Component, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Subject } from 'rxjs';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private dialogData$ = new BehaviorSubject<ConfirmDialogData | null>(null);
  private result$ = new Subject<boolean>();

  get data$() { return this.dialogData$.asObservable(); }

  confirm(data: ConfirmDialogData): Promise<boolean> {
    this.dialogData$.next(data);
    return new Promise<boolean>((resolve) => {
      const sub = this.result$.subscribe(result => {
        resolve(result);
        sub.unsubscribe();
      });
    });
  }

  respond(result: boolean) {
    this.result$.next(result);
    this.dialogData$.next(null);
  }
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (dialogService.data$ | async; as data) {
      <div class="modal-overlay" (click)="cancel()">
        <div class="confirm-modal" (click)="$event.stopPropagation()">
          <div class="confirm-icon" [class]="data.type || 'warning'">
            {{ data.type === 'danger' ? '🗑️' : data.type === 'info' ? 'ℹ️' : '⚠️' }}
          </div>
          <h3>{{ data.title }}</h3>
          <p>{{ data.message }}</p>
          <div class="confirm-actions">
            <button class="btn" [class]="data.type === 'danger' ? 'btn-danger' : 'btn-primary'" (click)="ok()">
              {{ data.confirmText || 'نعم' }}
            </button>
            <button class="btn btn-ghost" (click)="cancel()">
              {{ data.cancelText || 'لا، إلغاء' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-modal {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      padding: 32px;
      text-align: center;
      max-width: 400px;
      width: 90%;
      box-shadow: var(--shadow-lg);
      animation: slideUp 0.3s ease;
    }
    .confirm-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h3 {
      font-size: 18px;
      font-weight: 800;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    p {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .confirm-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(public dialogService: ConfirmDialogService) {}

  ok() { this.dialogService.respond(true); }
  cancel() { this.dialogService.respond(false); }
}
