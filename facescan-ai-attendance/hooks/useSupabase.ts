'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '@/lib/supabase/client';
import type { SupabaseConfig } from '@/lib/supabase/types';

export interface DiagnosticsResult {
  connection: boolean;
  profilesTable: boolean;
  peopleTable: boolean;
  attendanceTable: boolean;
  matchFaceRpc: boolean;
  facesBucket: boolean;
  details: {
    connectionError?: string;
    peopleError?: string;
    attendanceError?: string;
    profilesError?: string;
    rpcError?: string;
    bucketError?: string;
  };
}

export function useSupabase() {
  const [config, setConfig] = useState<SupabaseConfig>({
    url: '',
    anonKey: '',
    isConfigured: false,
    source: 'none',
  });
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshClient = useCallback(() => {
    const currentConfig = getSupabaseConfig();
    setConfig(currentConfig);

    if (currentConfig.isConfigured) {
      const client = getSupabaseBrowserClient();
      setSupabase(client);

      if (client) {
        client.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }).catch(() => {
          setLoading(false);
        });

        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
          setSession(session);
          setUser(session?.user ?? null);
        });

        return () => {
          subscription.unsubscribe();
        };
      }
    } else {
      setSupabase(null);
      setUser(null);
      setSession(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = refreshClient();

    const handleConfigChange = () => {
      refreshClient();
    };

    window.addEventListener('supabase-config-changed', handleConfigChange);

    return () => {
      window.removeEventListener('supabase-config-changed', handleConfigChange);
      if (typeof unsub === 'function') unsub();
    };
  }, [refreshClient]);

  // Run comprehensive database verification checklist
  const runDiagnostics = useCallback(async (clientOverride?: SupabaseClient): Promise<DiagnosticsResult> => {
    const client = clientOverride || supabase;
    const result: DiagnosticsResult = {
      connection: false,
      profilesTable: false,
      peopleTable: false,
      attendanceTable: false,
      matchFaceRpc: false,
      facesBucket: false,
      details: {},
    };

    if (!client) {
      result.details.connectionError = 'Supabase client is not initialized';
      return result;
    }

    // 1. Check basic connection via people query
    try {
      const { error: peopleErr } = await client.from('people').select('id').limit(1);
      if (!peopleErr) {
        result.connection = true;
        result.peopleTable = true;
      } else {
        result.details.peopleError = peopleErr.message;
        // If error is permission related, connection is still alive
        if (peopleErr.code === 'PGRST301' || peopleErr.code === '42501') {
          result.connection = true;
        }
      }
    } catch (err: unknown) {
      result.details.connectionError = err instanceof Error ? err.message : 'Failed to connect';
    }

    // 2. Check profiles table
    try {
      const { error: profErr } = await client.from('profiles').select('id').limit(1);
      if (!profErr) {
        result.profilesTable = true;
      } else {
        result.details.profilesError = profErr.message;
      }
    } catch (err: unknown) {
      result.details.profilesError = err instanceof Error ? err.message : 'Error';
    }

    // 3. Check attendance table
    try {
      const { error: attErr } = await client.from('attendance').select('id').limit(1);
      if (!attErr) {
        result.attendanceTable = true;
      } else {
        result.details.attendanceError = attErr.message;
      }
    } catch (err: unknown) {
      result.details.attendanceError = err instanceof Error ? err.message : 'Error';
    }

    // 4. Check match_face RPC function
    try {
      // Test call with dummy 128-d zero vector
      const dummyVec = new Array(128).fill(0);
      const { error: rpcErr } = await client.rpc('match_face', {
        query_embedding: dummyVec,
        threshold: 0.5,
      });

      if (!rpcErr) {
        result.matchFaceRpc = true;
      } else {
        // If the error is not "function does not exist", the function does exist!
        if (rpcErr.code === '42883') {
          result.details.rpcError = 'Function match_face does not exist in schema. Run the SQL schema to create it.';
        } else {
          // Function exists and ran (even if returning empty or argument type mismatch)
          result.matchFaceRpc = true;
        }
      }
    } catch (err: unknown) {
      result.details.rpcError = err instanceof Error ? err.message : 'RPC failed';
    }

    // 5. Check storage bucket 'faces'
    try {
      const { data: buckets, error: bucketErr } = await client.storage.listBuckets();
      if (!bucketErr && buckets) {
        const found = buckets.some((b) => b.name === 'faces');
        result.facesBucket = found;
        if (!found) {
          result.details.bucketError = 'Storage bucket "faces" not found. Create it in Supabase Storage or click Auto-Create.';
        }
      } else {
        result.details.bucketError = bucketErr?.message || 'Storage check failed';
      }
    } catch (err: unknown) {
      result.details.bucketError = err instanceof Error ? err.message : 'Storage check failed';
    }

    return result;
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    }
  }, [supabase]);

  return {
    supabase,
    config,
    isConfigured: config.isConfigured,
    user,
    session,
    loading,
    runDiagnostics,
    signOut,
    saveConfig: saveSupabaseConfig,
    clearConfig: clearSupabaseConfig,
  };
}
