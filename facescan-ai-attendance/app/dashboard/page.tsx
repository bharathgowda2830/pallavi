'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  UserX,
  Percent,
  Video,
  UserPlus,
  RefreshCw,
  ArrowUpRight,
  Clock,
  Sparkles,
  Database,
  Calendar,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Navbar } from '@/components/Navbar';
import { useSupabase } from '@/hooks/useSupabase';
import type { AttendanceRecord, Person } from '@/lib/supabase/types';

interface DashboardStats {
  totalPeople: number;
  presentToday: number;
  absentToday: number;
  attendanceRate: number;
}

interface ChartDay {
  day: string;
  dateStr: string;
  count: number;
}

export default function DashboardPage() {
  const { supabase, isConfigured } = useSupabase();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalPeople: 0,
    presentToday: 0,
    absentToday: 0,
    attendanceRate: 0,
  });
  const [recentCheckIns, setRecentCheckIns] = useState<
    (AttendanceRecord & { person?: Person })[]
  >([]);
  const [sevenDayChart, setSevenDayChart] = useState<ChartDay[]>([]);

  const fetchDashboardData = useCallback(async () => {
    if (!supabase || !isConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch total people count
      const { count: peopleCount, error: pErr } = await supabase
        .from('people')
        .select('*', { count: 'exact', head: true });

      const totalPeople = pErr ? 0 : peopleCount || 0;

      // 2. Fetch present today count
      const { data: todayRecords, error: aErr } = await supabase
        .from('attendance')
        .select('person_id')
        .eq('date', today);

      const uniquePresent = new Set((todayRecords || []).map((r) => r.person_id)).size;
      const absentToday = Math.max(0, totalPeople - uniquePresent);
      const rate = totalPeople > 0 ? Math.round((uniquePresent / totalPeople) * 100) : 0;

      setStats({
        totalPeople,
        presentToday: uniquePresent,
        absentToday,
        attendanceRate: rate,
      });

      // 3. Fetch recent check-ins with person details
      const { data: recents } = await supabase
        .from('attendance')
        .select('id, person_id, date, check_in, confidence, people (id, full_name, roll_no, department, photo_url)')
        .order('check_in', { ascending: false })
        .limit(8);

      if (recents) {
        // Flatten nested person relation
        const formatted = recents.map((r: any) => ({
          id: r.id,
          person_id: r.person_id,
          date: r.date,
          check_in: r.check_in,
          confidence: r.confidence,
          person: r.people || undefined,
        }));
        setRecentCheckIns(formatted);
      }

      // 4. Fetch past 7 days attendance for the chart
      const chartDays: ChartDay[] = [];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayLabel = `${dayNames[d.getDay()]} ${d.getDate()}`;

        // Query count for this day
        const { count: dayCount } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .eq('date', dateStr);

        chartDays.push({
          day: dayLabel,
          dateStr,
          count: dayCount || 0,
        });
      }

      setSevenDayChart(chartDays);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, isConfigured]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Fallback demo chart data if fresh/empty
  const displayChartData =
    sevenDayChart.some((d) => d.count > 0)
      ? sevenDayChart
      : [
          { day: 'Mon', count: 12 },
          { day: 'Tue', count: 19 },
          { day: 'Wed', count: 15 },
          { day: 'Thu', count: 22 },
          { day: 'Fri', count: 20 },
          { day: 'Sat', count: 8 },
          { day: 'Sun', count: stats.presentToday || 5 },
        ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner if Supabase is not configured */}
        {!isConfigured && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Database Setup Required
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Connect your Supabase project to enable real-time attendance logging and vector matching.
                </p>
              </div>
            </div>
            <Link
              href="/setup"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors shrink-0"
            >
              <span>Setup Database</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Top Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Biometric Intelligence Overview</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
              Attendance Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Real-time facial verification monitoring and daily participation insights.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchDashboardData}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <Link
              href="/enroll"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-all shadow-sm"
            >
              <UserPlus className="w-4 h-4 text-sky-500" />
              <span>Enroll Face</span>
            </Link>

            <Link
              href="/attendance"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-sky-600/25 transition-all"
            >
              <Video className="w-4 h-4 animate-pulse text-emerald-300" />
              <span>Start Kiosk Mode</span>
            </Link>
          </div>
        </div>

        {/* 4 Stat Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Total People */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Enrolled</span>
              <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {stats.totalPeople}
              </span>
              <p className="text-[11px] text-slate-500 mt-1">Students &amp; Faculty</p>
            </div>
          </div>

          {/* Present Today */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Present Today</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {stats.presentToday}
              </span>
              <p className="text-[11px] text-slate-500 mt-1">Verified check-ins</p>
            </div>
          </div>

          {/* Absent Today */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Absent Today</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <UserX className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400">
                {stats.absentToday}
              </span>
              <p className="text-[11px] text-slate-500 mt-1">Pending scans</p>
            </div>
          </div>

          {/* Attendance % */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Attendance Rate</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                {stats.attendanceRate}%
              </span>
              <p className="text-[11px] text-slate-500 mt-1">Today&apos;s completion</p>
            </div>
          </div>
        </div>

        {/* Middle Section: 7-Day Chart & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 7-Day Bar Chart */}
          <div className="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-500" />
                  <span>7-Day Attendance Trend</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daily verified facial check-ins over the previous week
                </p>
              </div>
              <Link
                href="/reports"
                className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
              >
                <span>View Full Reports</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    axisLine={{ stroke: '#334155', opacity: 0.3 }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    axisLine={{ stroke: '#334155', opacity: 0.3 }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                    formatter={(val: unknown) => [`${Number(val) || 0} People`, 'Checked In']}
                  />
                  <Bar
                    dataKey="count"
                    fill="url(#barGradient)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Operations & Kiosk Launcher */}
          <div className="lg:col-span-4 space-y-4">
            {/* Kiosk Mode Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white border border-indigo-900/50 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Video className="w-32 h-32" />
              </div>
              <div className="relative z-10 space-y-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Kiosk Ready
                </span>
                <h3 className="text-lg font-bold">Launch Check-in Kiosk</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Full-screen camera scanning with anti-spoofing blink verification, 500ms vector matching, and auto check-in.
                </p>
                <Link
                  href="/attendance"
                  className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md transition-all mt-2"
                >
                  <Video className="w-4 h-4" />
                  <span>Launch Live Camera</span>
                </Link>
              </div>
            </div>

            {/* Quick action shortcuts */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Quick Shortcuts
              </h3>
              <div className="space-y-2">
                <Link
                  href="/enroll"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <UserPlus className="w-4 h-4 text-sky-500" />
                    <span>Enroll Person Face</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>

                <Link
                  href="/people"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-emerald-500" />
                    <span>Manage People &amp; Rolls</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>

                <Link
                  href="/setup"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-amber-500" />
                    <span>Database Diagnostics</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Check-Ins List */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-500" />
                <span>Live Recent Check-Ins</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Most recent biometric verifications logged to the database
              </p>
            </div>
            <Link
              href="/reports"
              className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium"
            >
              View All Logs
            </Link>
          </div>

          {recentCheckIns.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700/60">
              <Sparkles className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No check-ins recorded yet today
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Start the Kiosk Mode to scan faces or enroll students to begin logging live attendance.
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Link
                  href="/attendance"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Launch Kiosk</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <th className="py-3 px-3">Person</th>
                    <th className="py-3 px-3">Roll Number</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3">Check-in Time</th>
                    <th className="py-3 px-3">Match Confidence</th>
                    <th className="py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {recentCheckIns.map((item) => {
                    const timeStr = item.check_in
                      ? new Date(item.check_in).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : 'N/A';

                    const confPercent = item.confidence
                      ? Math.round(item.confidence * 100)
                      : 95;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            {item.person?.photo_url ? (
                              <img
                                src={item.person.photo_url}
                                alt={item.person.full_name || 'Person'}
                                className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-700"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-[10px]">
                                {(item.person?.full_name || 'U').charAt(0)}
                              </div>
                            )}
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {item.person?.full_name || 'Unknown Person'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                          {item.person?.roll_no || 'N/A'}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                          {item.person?.department || 'General'}
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-mono">
                          {timeStr}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${confPercent}%` }}
                              />
                            </div>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              {confPercent}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                            Verified ✓
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
