import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from './types';

const STORAGE_KEY_URL = 'supabase_project_url';
const STORAGE_KEY_ANON = 'supabase_anon_key';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (envUrl && envAnonKey && !envUrl.includes('your-project-id')) {
    return {
      url: envUrl,
      anonKey: envAnonKey,
      isConfigured: true,
      source: 'env',
    };
  }

  if (typeof window !== 'undefined') {
    const localUrl = window.localStorage.getItem(STORAGE_KEY_URL)?.trim();
    const localAnonKey = window.localStorage.getItem(STORAGE_KEY_ANON)?.trim();

    if (localUrl && localAnonKey) {
      return {
        url: localUrl,
        anonKey: localAnonKey,
        isConfigured: true,
        source: 'localStorage',
      };
    }
  }

  return {
    url: '',
    anonKey: '',
    isConfigured: false,
    source: 'none',
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window === 'undefined') return;
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();
  window.localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
  window.localStorage.setItem(STORAGE_KEY_ANON, cleanKey);
  cachedClient = null;
  cachedConfigKey = '';
  // Dispatch custom event for real-time state update in hooks
  window.dispatchEvent(new Event('supabase-config-changed'));
}

export function clearSupabaseConfig(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY_URL);
  window.localStorage.removeItem(STORAGE_KEY_ANON);
  cachedClient = null;
  cachedConfigKey = '';
  window.dispatchEvent(new Event('supabase-config-changed'));
}

export function createCustomClient(url: string, anonKey: string): SupabaseClient {
  return createBrowserClient(url, anonKey);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return null;
  }

  const currentKey = `${config.url}::${config.anonKey}`;
  if (cachedClient && cachedConfigKey === currentKey) {
    return cachedClient;
  }

  cachedClient = createBrowserClient(config.url, config.anonKey);
  cachedConfigKey = currentKey;
  return cachedClient;
}

// Default export compatible with standard imports
export const supabase = {
  get client(): SupabaseClient | null {
    return getSupabaseBrowserClient();
  },
};
