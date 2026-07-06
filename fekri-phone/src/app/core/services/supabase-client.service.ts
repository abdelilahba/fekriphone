import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Single source of truth for the Supabase client.
 * Both AuthService and SupabaseService must use THIS instance
 * to avoid the "Multiple GoTrueClient instances" warning and
 * the resulting "Invalid Refresh Token" errors.
 */
@Injectable({
  providedIn: 'root'
})
export class SupabaseClientService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseKey
  );
}
