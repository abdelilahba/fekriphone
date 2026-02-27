import { Component, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  error = '';
  showResetPassword = false;
  resetEmail = '';
  resetMessage = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  async onSubmit() {
    if (!this.email || !this.password) {
      this.error = 'خصك تدخل الإيميل والباسوورد';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      const result = await this.auth.signIn(this.email, this.password);
      this.ngZone.run(() => {
        if (result.error) {
          this.error = this.getErrorMessage(result.error.message);
          this.loading = false;
        } else {
          this.router.navigate(['/']);
        }
        this.cdr.detectChanges();
      });
    } catch (e) {
      this.ngZone.run(() => {
        this.error = 'وقع مشكل، عاود حاول';
        this.loading = false;
        this.cdr.detectChanges();
      });
    }
  }

  async onResetPassword() {
    if (!this.resetEmail) {
      this.error = 'خصك تدخل الإيميل';
      return;
    }
    this.loading = true;
    const { error } = await this.auth.resetPassword(this.resetEmail);
    this.ngZone.run(() => {
      this.loading = false;
      if (error) {
        this.error = 'وقع مشكل فإرسال الإيميل';
      } else {
        this.resetMessage = 'تبعثات ليك رسالة فالإيميل باش تبدل الباسوورد ✅';
        this.showResetPassword = false;
      }
      this.cdr.detectChanges();
    });
  }

  private getErrorMessage(msg: string): string {
    if (msg.includes('Invalid login')) return 'الإيميل أو الباسوورد غالط';
    if (msg.includes('Email not confirmed')) return 'خصك تأكد الإيميل ديالك';
    return 'وقع مشكل: ' + msg;
  }
}
