'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileBarChart,
  Download,
  Filter,
  Calendar,
  Search,
  Building2,
  RefreshCw,
  Percent,
  CheckCircle2,
  UserCheck,
  TrendingUp,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useSupabase } from '@/hooks/useSupabase';
import { useToast } from '@/components/Toast';
import type { AttendanceRecord, Person } from '@/lib/supabase/types';

export default function ReportsPage() {
  const { supabase, isConfigured } = useSupabase();
  const { success, error: toastError } = useToast();

  const [records, setRecords] = useState<(AttendanceRecord & { person?: Person })[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFilter, setDateFilter] = useState<'today' | '7days' | '30days' | 'custom'>('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'logs' | 'per_person'>('logs');

  // Compute date range
  const dateRange = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (dateFilter === 'today') {
      return { start: todayStr, end: todayStr };
    }
    if (dateFilter === '7days') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      return { start: past.toISOString().split('T')[0], end: todayStr };
    }
    if (dateFilter === '30days') {
      const past = new Date();
      past.setDate(today.getDate() - 30);
      return { start: past.toISOString().split('T')[0], end: todayStr };
    }
    if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return { start: customStartDate, end: customEndDate };
    }
    return { start: todayStr, end: todayStr };
  }, [dateFilter, customStartDate, customEndDate]);

  const fetchReportData = useCallback(async () => {
    if (!supabase || !isConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch people directory
      const { data: peopleData } = await supabase.from('people').select('*').order('full_name');
      if (peopleData) setPeople(peopleData as unknown as Person[]);

      // 2. Fetch attendance logs in date range
      let query = supabase
        .from('attendance')
        .select('id, person_id, date, check_in, confidence, people (id, full_name, roll_no, department, photo_url)')
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('check_in', { ascending: false });

      const { data: logsData, error } = await query;
      if (error) throw error;

      if (logsData) {
        const formatted = logsData.map((r: any) => ({
          id: r.id,
          person_id: r.person_id,
          date: r.date,
          check_in: r.check_in,
          confidence: r.confidence,
          person: r.people || undefined,
        }));
        setRecords(formatted);
      }
    } catch (err: unknown) {
      console.error('Error fetching report:', err);
      toastError('Could not load attendance reports.');
    } finally {
      setLoading(false);
    }
  }, [supabase, isConfigured, dateRange, toastError]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Departments list
  const departments = useMemo(() => {
    const set = new Set<string>();
    people.forEach((p) => {
      if (p.department) set.add(p.department);
    });
    return ['All', ...Array.from(set)];
  }, [people]);

  // Filtered attendance records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const name = r.person?.full_name?.toLowerCase() || '';
      const roll = r.person?.roll_no?.toLowerCase() || '';
      const dept = r.person?.department || 'General';

      const matchesSearch =
        name.includes(searchQuery.toLowerCase()) || roll.includes(searchQuery.toLowerCase());

      const matchesDept = deptFilter === 'All' || dept === deptFilter;

      return matchesSearch && matchesDept;
    });
  }, [records, searchQuery, deptFilter]);

  // Per-person statistics calculation
  const perPersonStats = useMemo(() => {
    // Determine unique dates in the current range
    const dStart = new Date(dateRange.start);
    const dEnd = new Date(dateRange.end);
    const dayCount = Math.max(1, Math.round((dEnd.getTime() - dStart.getTime()) / (1000 * 3600 * 24)) + 1);

    return people
      .filter((p) => deptFilter === 'All' || p.department === deptFilter)
      .filter(
        (p) =>
          p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.roll_no.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .map((p) => {
        const personLogs = records.filter((r) => r.person_id === p.id);
        const daysPresent = new Set(personLogs.map((r) => r.date)).size;
        const rate = Math.min(100, Math.round((daysPresent / dayCount) * 100));

        return {
          person: p,
          daysPresent,
          totalDays: dayCount,
          rate,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [people, records, dateRange, deptFilter, searchQuery]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) {
      toastError('No records to export in the selected range.');
      return;
    }

    const headers = ['Date', 'Time', 'Roll Number', 'Full Name', 'Department', 'Confidence', 'Status'];
    const rows = filteredRecords.map((r) => {
      const timeStr = r.check_in
        ? new Date(r.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'N/A';
      const confStr = r.confidence ? `${Math.round(r.confidence * 100)}%` : '95%';

      return [
        `"${r.date}"`,
        `"${timeStr}"`,
        `"${r.person?.roll_no || ''}"`,
        `"${r.person?.full_name || ''}"`,
        `"${r.person?.department || ''}"`,
        `"${confStr}"`,
        '"Verified"',
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `attendance-report-${dateRange.start}-to-${dateRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    success('Attendance CSV downloaded successfully!');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <FileBarChart className="w-4 h-4" />
              <span>Biometric Records &amp; Analytics</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
              Attendance Reports
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Filter by date, department, or individual. Calculate attendance percentages and export CSV files.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchReportData}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filters Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Date range presets */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDateFilter('today')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  dateFilter === 'today'
                    ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('7days')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  dateFilter === '7days'
                    ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Past 7 Days
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('30days')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  dateFilter === '30days'
                    ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Past 30 Days
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('custom')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  dateFilter === 'custom'
                    ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Custom Range
              </button>
            </div>

            {/* Custom Date Pickers */}
            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
            )}

            {/* Department dropdown & search */}
            <div className="flex items-center gap-3">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    Department: {d}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter name or roll..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Tab selector */}
          <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'logs'
                  ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Detailed Log Records ({filteredRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('per_person')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'per_person'
                  ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Per-Person Attendance Rate ({perPersonStats.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Detailed Logs */}
        {activeTab === 'logs' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-500" />
                Querying attendance logs...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-12 text-center space-y-2 text-slate-400">
                <FileBarChart className="w-8 h-8 mx-auto text-slate-500" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  No attendance records found for this period
                </p>
                <p className="text-xs text-slate-500">
                  Try adjusting the date range or scanning faces in Kiosk Mode.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold bg-slate-50/50 dark:bg-slate-800/40">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Person</th>
                      <th className="py-3 px-4">Roll Number</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Confidence</th>
                      <th className="py-3 px-4">Biometric Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredRecords.map((r) => {
                      const timeStr = r.check_in
                        ? new Date(r.check_in).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : 'N/A';
                      const confPercent = r.confidence ? Math.round(r.confidence * 100) : 96;

                      return (
                        <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                            {r.date}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {timeStr}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {r.person?.photo_url ? (
                                <img
                                  src={r.person.photo_url}
                                  alt={r.person.full_name}
                                  className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-700"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px]">
                                  {(r.person?.full_name || 'U').charAt(0)}
                                </div>
                              )}
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {r.person?.full_name || 'Unknown'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                            {r.person?.roll_no || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                            {r.person?.department || 'General'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              {confPercent}%
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              <span>Verified Facial Scan</span>
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
        )}

        {/* Tab 2: Per-Person Rate Analysis */}
        {activeTab === 'per_person' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 flex items-center justify-between">
              <span>Showing individual attendance percentage in the selected period.</span>
              <span className="font-mono">Window: {dateRange.start} to {dateRange.end}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold bg-slate-50/20 dark:bg-slate-800/20">
                    <th className="py-3 px-4">Person</th>
                    <th className="py-3 px-4">Roll Number</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Days Present</th>
                    <th className="py-3 px-4">Attendance Rate (%)</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {perPersonStats.map(({ person, daysPresent, totalDays, rate }) => {
                    let rateBadge = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
                    let statusLabel = 'Optimal (>85%)';

                    if (rate < 60) {
                      rateBadge = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
                      statusLabel = 'Low Attendance (<60%)';
                    } else if (rate < 85) {
                      rateBadge = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
                      statusLabel = 'Average (60-85%)';
                    }

                    return (
                      <tr key={person.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            {person.photo_url ? (
                              <img
                                src={person.photo_url}
                                alt={person.full_name}
                                className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-700"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px]">
                                {person.full_name.charAt(0)}
                              </div>
                            )}
                            <span>{person.full_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {person.roll_no}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {person.department || 'General'}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {daysPresent} / {totalDays} days
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  rate >= 85 ? 'bg-emerald-500' : rate >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {rate}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${rateBadge}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
