'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Server,
  Sparkles,
  ArrowRight,
  HelpCircle,
  FolderPlus,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useSupabase, DiagnosticsResult } from '@/hooks/useSupabase';
import { useToast } from '@/components/Toast';
import { createCustomClient } from '@/lib/supabase/client';

const FULL_SQL_SCHEMA = `-- 1. Enable pgvector extension for 128-dimensional facial embedding search
create extension if not exists vector;

-- 2. Profiles table for authenticated users / admins
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text default 'admin'
);

-- 3. People table (students / employees) with 128-d face descriptor vector
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  roll_no text unique not null,
  department text,
  photo_url text,
  face_descriptor vector(128),
  created_at timestamptz default now()
);

-- 4. Attendance logs (one check-in per person per calendar date)
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  date date default current_date,
  check_in timestamptz default now(),
  confidence float,
  unique (person_id, date)
);

-- 5. Cosine / Euclidean distance vector similarity matching function
create or replace function match_face(query_embedding vector(128), threshold float default 0.5)
returns table (id uuid, full_name text, roll_no text, distance float)
language sql stable as $$
  select
    id,
    full_name,
    roll_no,
    (face_descriptor <-> query_embedding) as distance
  from people
  where face_descriptor is not null and (face_descriptor <-> query_embedding) < threshold
  order by face_descriptor <-> query_embedding
  limit 1;
$$;

-- 6. Row Level Security
alter table people enable row level security;
alter table attendance enable row level security;
alter table profiles enable row level security;

-- 7. RLS Policies
create policy "auth people" on people for all to authenticated using (true) with check (true);
create policy "auth attendance" on attendance for all to authenticated using (true) with check (true);
create policy "own profile" on profiles for all to authenticated using (auth.uid() = id);

-- 8. Policies for Kiosk mode and client access
create policy "kiosk read people" on people for select using (true);
create policy "kiosk insert people" on people for insert with check (true);
create policy "kiosk update people" on people for update using (true);
create policy "kiosk delete people" on people for delete using (true);
create policy "kiosk read attendance" on attendance for select using (true);
create policy "kiosk insert attendance" on attendance for insert with check (true);
create policy "kiosk delete attendance" on attendance for delete using (true);
`;

export default function SetupPage() {
  const router = useRouter();
  const { config, saveConfig, runDiagnostics } = useSupabase();
  const { success, error: toastError, info } = useToast();

  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
    fixHint?: string;
  }>({ status: 'idle', message: '' });

  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (config.url) setUrl(config.url);
    if (config.anonKey) setAnonKey(config.anonKey);
  }, [config]);

  // Handle saving and testing connection
  const handleTestConnection = async (overrideUrl?: string, overrideKey?: string) => {
    const targetUrl = (overrideUrl || url).trim();
    const targetKey = (overrideKey || anonKey).trim();

    if (!targetUrl || !targetKey) {
      toastError('Please fill in both Project URL and Anon Key.');
      setTestResult({
        status: 'error',
        message: 'Missing credentials',
        fixHint: 'Enter your Supabase Project URL and Anon Key from your Supabase Dashboard.',
      });
      return;
    }

    if (!targetUrl.startsWith('http')) {
      toastError('Project URL must begin with https://');
      setTestResult({
        status: 'error',
        message: 'Invalid URL format',
        fixHint: 'Example: https://abcdefghijklm.supabase.co',
      });
      return;
    }

    setTesting(true);
    setTestResult({ status: 'idle', message: 'Testing connection...' });

    try {
      // Create temporary client to test without corrupting state
      const testClient = createCustomClient(targetUrl, targetKey);

      // Attempt to query people table
      const { data: _data, error } = await testClient.from('people').select('id').limit(1);

      if (error) {
        if (error.code === 'PGRST204' || error.message?.includes('relation "people" does not exist')) {
          setTestResult({
            status: 'error',
            message: 'Connected to Supabase, but "people" table is missing.',
            fixHint: 'Click the "Copy SQL" button below and run it in the Supabase SQL Editor.',
          });
        } else if (error.code === '42501' || error.message?.includes('row-level security')) {
          // Connected, just RLS
          setTestResult({
            status: 'success',
            message: 'Connected successfully! (Table exists with RLS active)',
          });
        } else {
          setTestResult({
            status: 'error',
            message: `Connection error: ${error.message}`,
            fixHint: 'Verify your Anon key and make sure project is active in Supabase.',
          });
        }
      } else {
        setTestResult({
          status: 'success',
          message: 'Connected to Supabase successfully!',
        });
      }

      // Save to localStorage
      saveConfig(targetUrl, targetKey);
      // Set a cookie so Edge middleware knows setup has occurred
      document.cookie = 'sb_setup_configured=true; path=/; max-age=31536000';

      // Run full diagnostics
      const diag = await runDiagnostics(testClient);
      setDiagnostics(diag);

      if (!error) {
        success('Supabase connected and credentials saved!');
      }
    } catch (err: unknown) {
      setTestResult({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown connection error',
        fixHint: 'Check your network connection and Supabase URL.',
      });
      toastError('Failed to connect to Supabase.');
    } finally {
      setTesting(false);
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(FULL_SQL_SCHEMA);
      setCopiedSql(true);
      success('Database schema SQL copied to clipboard!');
      setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      toastError('Could not copy automatically. Please select and copy manually.');
    }
  };

  const handleCreateBucket = async () => {
    if (!url || !anonKey) {
      toastError('Please connect to Supabase first.');
      return;
    }

    setCreatingBucket(true);
    try {
      const client = createCustomClient(url, anonKey);
      const { error } = await client.storage.createBucket('faces', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });

      if (error) {
        if (error.message?.includes('already exists')) {
          info('Storage bucket "faces" already exists.');
        } else {
          throw error;
        }
      } else {
        success('Storage bucket "faces" created with public access!');
      }

      // Re-run diagnostics
      const diag = await runDiagnostics(client);
      setDiagnostics(diag);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to create storage bucket.');
    } finally {
      setCreatingBucket(false);
    }
  };

  const handleSeedSamplePeople = async () => {
    if (!url || !anonKey) {
      toastError('Please connect to Supabase first.');
      return;
    }

    setSeeding(true);
    try {
      const client = createCustomClient(url, anonKey);
      const samplePeople = [
        {
          full_name: 'Dr. Jane Cooper',
          roll_no: 'FAC-1001',
          department: 'Computer Science',
          photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
        },
        {
          full_name: 'Alex Johnson',
          roll_no: 'CS-2024-042',
          department: 'Computer Science',
          photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
        },
        {
          full_name: 'Sophia Martinez',
          roll_no: 'EE-2024-018',
          department: 'Electrical Engineering',
          photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face',
        },
        {
          full_name: 'Liam Chen',
          roll_no: 'ME-2024-091',
          department: 'Mechanical Engineering',
          photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
        },
      ];

      for (const p of samplePeople) {
        await client.from('people').upsert(p, { onConflict: 'roll_no' });
      }

      success('Sample student & faculty profiles added! You can now enroll their faces.');
      const diag = await runDiagnostics(client);
      setDiagnostics(diag);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Error seeding demo data.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 text-sm font-semibold mb-1">
              <Database className="w-4 h-4" />
              <span>Database Configuration Wizard</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Supabase Connection & Schema
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Connect your Supabase project in seconds. Credentials are read from environment variables or saved safely in your browser session.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm shadow-sm transition-all"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Security Alert: Never use service_role */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 text-sm">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-amber-800 dark:text-amber-300">Client-Side Security Notice:</span>
            <p className="text-xs text-amber-700 dark:text-amber-300/90 leading-relaxed">
              Always use your public <strong>anon key</strong>. Never enter or paste your secret <code className="bg-amber-200/60 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono">service_role</code> key into browser forms.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Form & Checklist */}
          <div className="lg:col-span-7 space-y-6">
            {/* Connection Credentials Form */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-sky-500" />
                  <span>1. Supabase Credentials</span>
                </h2>
                {config.source !== 'none' && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    Source: {config.source}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="supabase-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Project URL (NEXT_PUBLIC_SUPABASE_URL)
                  </label>
                  <input
                    id="supabase-url"
                    type="url"
                    placeholder="https://xyzabcdefghijklm.supabase.co"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Found in Supabase &gt; Project Settings &gt; API &gt; Project URL.
                  </p>
                </div>

                <div>
                  <label htmlFor="supabase-anon-key" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Anon Key (NEXT_PUBLIC_SUPABASE_ANON_KEY)
                  </label>
                  <input
                    id="supabase-anon-key"
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Found in Supabase &gt; Project Settings &gt; API &gt; Project API keys &gt; `anon` `public`.
                  </p>
                </div>

                {/* Test button & status */}
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleTestConnection()}
                    disabled={testing}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-sky-600/20 transition-all cursor-pointer"
                  >
                    {testing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Database className="w-4 h-4" />
                    )}
                    <span>{testing ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  {testResult.status !== 'idle' && (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                        testResult.status === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {testResult.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>

                {testResult.fixHint && (
                  <div className="text-xs p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                    <span><strong>Hint:</strong> {testResult.fixHint}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Verification Checklist */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-500" />
                  <span>2. Schema Verification Checklist</span>
                </h2>
                <button
                  type="button"
                  onClick={() => handleTestConnection()}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Re-check</span>
                </button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {/* Tables check */}
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Table: `people`</p>
                    <p className="text-[11px] text-slate-500">Stores student & employee profiles with 128-d face vector</p>
                  </div>
                  {diagnostics?.peopleTable ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3.5 h-3.5" /> Missing
                    </span>
                  )}
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Table: `attendance`</p>
                    <p className="text-[11px] text-slate-500">Tracks daily check-ins, timestamps, and confidence</p>
                  </div>
                  {diagnostics?.attendanceTable ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3.5 h-3.5" /> Missing
                    </span>
                  )}
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Table: `profiles`</p>
                    <p className="text-[11px] text-slate-500">Admin and system user authentication records</p>
                  </div>
                  {diagnostics?.profilesTable ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3.5 h-3.5" /> Missing
                    </span>
                  )}
                </div>

                {/* RPC match_face */}
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">RPC Function: `match_face`</p>
                    <p className="text-[11px] text-slate-500">pgvector &lt;-&gt; distance operator matching</p>
                  </div>
                  {diagnostics?.matchFaceRpc ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3.5 h-3.5" /> Missing
                    </span>
                  )}
                </div>

                {/* Storage bucket */}
                <div className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Storage Bucket: `faces`</p>
                    <p className="text-[11px] text-slate-500">Public bucket for face crop enrollment photos</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {diagnostics?.facesBucket ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCreateBucket}
                        disabled={creatingBucket || !url}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 hover:bg-sky-200 transition-colors"
                      >
                        <FolderPlus className="w-3 h-3" />
                        <span>{creatingBucket ? 'Creating...' : 'Create "faces" Bucket'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Seed demo data helper */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Quick Test People</p>
                  <p className="text-[11px] text-slate-500">Seed 4 sample people to test enrollment & kiosk</p>
                </div>
                <button
                  type="button"
                  onClick={handleSeedSamplePeople}
                  disabled={seeding || !diagnostics?.peopleTable}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{seeding ? 'Adding...' : 'Seed Sample People'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Schema SQL & Instructions */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    3. Database Schema SQL
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Includes vector(128), tables, policies & match_face function
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy SQL</span>
                    </>
                  )}
                </button>
              </div>

              {/* Code preview */}
              <div className="relative">
                <pre className="p-3.5 rounded-xl bg-slate-950 text-slate-200 text-xs font-mono h-64 overflow-y-auto border border-slate-800 leading-relaxed">
                  <code>{FULL_SQL_SCHEMA}</code>
                </pre>
              </div>

              {/* Step-by-step paste instructions */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  How to Apply in Supabase:
                </h3>
                <ol className="text-xs space-y-2 text-slate-600 dark:text-slate-400 list-decimal list-inside leading-relaxed">
                  <li>
                    Open your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-sky-600 dark:text-sky-400 underline inline-flex items-center gap-0.5">Supabase Dashboard <ExternalLink className="w-3 h-3" /></a>.
                  </li>
                  <li>
                    Click on the <strong>SQL Editor</strong> tab in the left sidebar.
                  </li>
                  <li>
                    Click <strong>&quot;New Query&quot;</strong>, paste the copied SQL, and click <strong>&quot;Run&quot;</strong>.
                  </li>
                  <li>
                    Return to this page and click <strong>&quot;Test Connection&quot;</strong> to verify all green ticks!
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
