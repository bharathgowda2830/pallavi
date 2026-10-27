import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig, getSupabaseBrowserClient } from './lib/supabase/client';

/**
 * Initiates the Google OAuth sign-in flow with Supabase.
 * Uses the Supabase client initialized with your project credentials.
 *
 * @param {string} [redirectTo] - Optional URL to redirect to after authentication.
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function signInWithGoogle(redirectTo) {
  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new Error(
      'Supabase is not configured yet. Please enter your Supabase Project URL and Anon Key in the Setup page.'
    );
  }

  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : '';

  const targetRedirect = redirectTo || (origin ? `${origin}/dashboard` : undefined);

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: targetRedirect,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('Supabase Google OAuth error:', error);
    throw error;
  }

  return { data, error: null };
}

// Convenient alias
export const loginWithGoogle = signInWithGoogle;

/**
 * Export active Supabase client instance
 */
export const supabase = {
  get auth() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      throw new Error('Supabase client is not configured.');
    }
    return client.auth;
  },
  from(...args) {
    const client = getSupabaseBrowserClient();
    if (!client) {
      throw new Error('Supabase client is not configured.');
    }
    return client.from(...args);
  },
  rpc(...args) {
    const client = getSupabaseBrowserClient();
    if (!client) {
      throw new Error('Supabase client is not configured.');
    }
    return client.rpc(...args);
  },
  get storage() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      throw new Error('Supabase client is not configured.');
    }
    return client.storage;
  },
};

export default supabase;
