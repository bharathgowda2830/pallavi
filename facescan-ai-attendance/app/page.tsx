'use client';

import React from 'react';
import Link from 'next/link';
import {
  ScanFace,
  Video,
  LayoutDashboard,
  ShieldCheck,
  Zap,
  Users,
  Eye,
  Database,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useSupabase } from '@/hooks/useSupabase';

export default function HomePage() {
  const { isConfigured } = useSupabase();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      <Navbar />

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-32 flex-1 flex flex-col justify-center">
          {/* Ambient biometric glow effects */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-sky-600/20 via-indigo-600/20 to-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-8">
            {/* Pill tag */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-semibold text-sky-400 shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Next.js 15 • Supabase pgvector • TinyFaceDetector</span>
            </div>

            {/* Headline */}
            <div className="space-y-4 max-w-4xl mx-auto">
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-tight">
                AI Smart Attendance with{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-300 to-emerald-400">
                  Facial Recognition
                </span>
              </h1>
              <p className="text-base sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Client-side biometric intelligence with anti-spoofing eye-blink detection and sub-500ms 128-dimensional pgvector matching.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Link
                href="/attendance"
                className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-sky-500/25 transition-all transform hover:-translate-y-0.5"
              >
                <Video className="w-5 h-5 text-emerald-300 animate-pulse" />
                <span>Launch Kiosk Mode</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold text-sm shadow-lg transition-all"
              >
                <LayoutDashboard className="w-5 h-5 text-sky-400" />
                <span>View Dashboard</span>
              </Link>

              {!isConfigured && (
                <Link
                  href="/setup"
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm font-semibold transition-all"
                >
                  <Database className="w-4 h-4 text-amber-400" />
                  <span>Configure Supabase</span>
                </Link>
              )}
            </div>

            {/* Key feature highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto pt-16 text-left">
              {/* Feature 1 */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                  <Eye className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Anti-Spoofing Liveness</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Real-time Eye Aspect Ratio (EAR) calculation from 68 facial landmarks requires a live blink before granting verified check-in.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Sub-500ms Vector Search</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  128-d face descriptors queried via Supabase pgvector Euclidean distance operators with automatic 3-second person cooldowns.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Zero Video Uploads</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Face detection runs strictly in the browser. Only cryptographic vector numbers are stored, preserving maximum student privacy.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>AI Smart Attendance System • Powered by Next.js App Router &amp; Supabase</p>
      </footer>
    </div>
  );
}
