import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private currentUser$ = new BehaviorSubject<User | null>(null);
  private loading$ = new BehaviorSubject<boolean>(true);

  user$ = this.currentUser$.asObservable();
  isLoading$ = this.loading$.asObservable();

  constructor(private router: Router, private ngZone: NgZone) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.initAuth();
  }

  private async initAuth() {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      this.ngZone.run(() => {
        this.currentUser$.next(session?.user ?? null);
      });

      this.supabase.auth.onAuthStateChange((_event, session) => {
        this.ngZone.run(() => {
          this.currentUser$.next(session?.user ?? null);
          if (!session?.user && this.router.url !== '/login') {
            this.router.navigate(['/login']);
          }
        });
      });
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      this.ngZone.run(() => {
        this.loading$.next(false);
      });
    }
  }

  get currentUser(): User | null {
    return this.currentUser$.value;
  }

  get isAuthenticated(): boolean {
    return !!this.currentUser$.value;
  }

  async signIn(email: string, password: string): Promise<{ error: any }> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async signOut() {
    await this.supabase.auth.signOut();
    this.ngZone.run(() => {
      this.currentUser$.next(null);
      this.router.navigate(['/login']);
    });
  }

  async resetPassword(email: string): Promise<{ error: any }> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email);
    return { error };
  }

  async updatePassword(newPassword: string): Promise<{ error: any }> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    return { error };
  }
}
