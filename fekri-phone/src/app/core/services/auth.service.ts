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
  private _currentUser$ = new BehaviorSubject<User | null>(null);
  private _userRole$ = new BehaviorSubject<string>('admin');
  private _userMetadata$ = new BehaviorSubject<any>(null);
  private _loading$ = new BehaviorSubject<boolean>(true);

  user$ = this._currentUser$.asObservable();
  userRole$ = this._userRole$.asObservable();
  userMetadata$ = this._userMetadata$.asObservable();
  isLoading$ = this._loading$.asObservable();

  constructor(private router: Router, private ngZone: NgZone) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.initAuth();
  }

  private async initAuth() {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      this.handleUserChange(session?.user ?? null);

      this.supabase.auth.onAuthStateChange((_event, session) => {
        this.handleUserChange(session?.user ?? null);
        if (!session?.user && this.router.url !== '/login') {
          this.router.navigate(['/login']);
        }
      });
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      this.ngZone.run(() => {
        this._loading$.next(false);
      });
    }
  }

  private handleUserChange(user: User | null) {
    this.ngZone.run(() => {
      this._currentUser$.next(user);
      if (user) {
        const role = user.user_metadata?.['role'] || 'admin';
        this._userRole$.next(role);
        this._userMetadata$.next(user.user_metadata);
      } else {
        this._userRole$.next('admin');
        this._userMetadata$.next(null);
      }
    });
  }

  get currentUser(): User | null {
    return this._currentUser$.value;
  }

  get isAuthenticated(): boolean {
    return !!this._currentUser$.value;
  }

  async signIn(email: string, password: string): Promise<{ error: any }> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async signOut() {
    await this.supabase.auth.signOut();
    this.ngZone.run(() => {
      this._currentUser$.next(null);
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
