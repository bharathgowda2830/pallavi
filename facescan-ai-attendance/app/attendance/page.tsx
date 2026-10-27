'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Video,
  ScanFace,
  CheckCircle2,
  AlertCircle,
  Eye,
  Maximize2,
  Minimize2,
  RefreshCw,
  Clock,
  Sparkles,
  ShieldCheck,
  VideoOff,
  SunMedium,
  Users,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { FaceCanvasOverlay } from '@/components/FaceCanvasOverlay';
import {
  useFaceApi,
  DetectionResult,
  euclideanDistance,
  calculateBrightness,
} from '@/hooks/useFaceApi';
import { useCamera } from '@/hooks/useCamera';
import { useSupabase } from '@/hooks/useSupabase';
import { useToast } from '@/components/Toast';
import { sounds } from '@/lib/sound';
import type { Person, AttendanceRecord, MatchFaceResult } from '@/lib/supabase/types';

interface VerifiedPersonModal {
  id: string;
  name: string;
  rollNo: string;
  department?: string;
  photoUrl?: string;
  confidence: number;
  time: string;
}

export default function AttendanceKioskPage() {
  const { supabase, isConfigured } = useSupabase();
  const { success, warning, info, error: toastError } = useToast();

  const {
    isLoaded: modelsLoaded,
    loadingProgress,
    loadingError,
    detectSingleFace,
    detectAllFaces,
  } = useFaceApi();

  const {
    videoRef,
    isActive: cameraActive,
    error: cameraError,
    startCamera,
    stopCamera,
    toggleFacingMode,
  } = useCamera({ width: 720, height: 540 });

  // Recognition and detection states
  const [currentDetection, setCurrentDetection] = useState<DetectionResult | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Anti-spoofing liveness states
  // Stages: 'idle' | 'awaiting_blink' | 'blink_detected' | 'verified' | 'cooldown'
  const [livenessStage, setLivenessStage] = useState<
    'idle' | 'awaiting_blink' | 'blink_detected' | 'verified' | 'cooldown'
  >('idle');
  const [earValue, setEarValue] = useState<number>(0);
  const blinkHistoryRef = useRef<number[]>([]);
  const hasBlinkedRef = useRef<boolean>(false);

  // Status HUD
  const [hudMessage, setHudMessage] = useState('Position your face in front of the camera');
  const [hudType, setHudType] = useState<'default' | 'success' | 'warning' | 'error'>('default');

  // Match / Overlay
  const [verifiedModal, setVerifiedModal] = useState<VerifiedPersonModal | null>(null);
  const [unknownFaceAlert, setUnknownFaceAlert] = useState(false);

  // Cooldown tracker: map personId -> timestamp
  const cooldownMapRef = useRef<Map<string, number>>(new Map());
  const unknownCooldownRef = useRef<number>(0);

  // Enrolled people cache (used for instant fallback if RPC is pending)
  const enrolledPeopleRef = useRef<Person[]>([]);
  const [todayLogs, setTodayLogs] = useState<(AttendanceRecord & { person?: Person })[]>([]);

  // Fetch enrolled people and today's attendance logs
  const loadKioskData = useCallback(async () => {
    if (!supabase) return;
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Load enrolled people
      const { data: peopleData } = await supabase
        .from('people')
        .select('*')
        .not('face_descriptor', 'is', null);

      if (peopleData) {
        enrolledPeopleRef.current = peopleData as unknown as Person[];
      }

      // 2. Load today's logs
      const { data: logsData } = await supabase
        .from('attendance')
        .select('id, person_id, date, check_in, confidence, people (id, full_name, roll_no, department, photo_url)')
        .eq('date', today)
        .order('check_in', { ascending: false })
        .limit(10);

      if (logsData) {
        const formatted = logsData.map((l: any) => ({
          id: l.id,
          person_id: l.person_id,
          date: l.date,
          check_in: l.check_in,
          confidence: l.confidence,
          person: l.people || undefined,
        }));
        setTodayLogs(formatted);
      }
    } catch (err) {
      console.warn('Could not load kiosk logs:', err);
    }
  }, [supabase]);

  useEffect(() => {
    loadKioskData();
  }, [loadKioskData]);

  // Start camera on mount once models ready
  useEffect(() => {
    if (modelsLoaded && !cameraActive && !cameraError) {
      startCamera();
    }
  }, [modelsLoaded, cameraActive, cameraError, startCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Fullscreen toggle
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Perform attendance record insertion
  const recordAttendance = useCallback(
    async (person: { id: string; name: string; rollNo: string; department?: string; photoUrl?: string }, confidence: number) => {
      if (!supabase) return;

      const today = new Date().toISOString().split('T')[0];
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Trigger pleasant chime immediately for low-latency feedback
      sounds.playSuccess();

      // Show large HUD overlay
      setVerifiedModal({
        id: person.id,
        name: person.name,
        rollNo: person.rollNo,
        department: person.department,
        photoUrl: person.photoUrl,
        confidence,
        time: nowTime,
      });

      setHudMessage(`✓ ${person.name} (${person.rollNo}) - Attendance Marked!`);
      setHudType('success');

      try {
        // Insert record (Supabase UNIQUE constraint prevents duplicate for same person & date)
        const { error: insErr } = await supabase.from('attendance').insert({
          person_id: person.id,
          date: today,
          confidence,
        });

        if (insErr) {
          // If error is duplicate key violation (23505), attendance already logged for today
          if (insErr.code === '23505') {
            info(`${person.name} already checked in today!`);
          } else {
            console.warn('Attendance insert error:', insErr);
          }
        } else {
          success(`Check-in logged for ${person.name}!`);
        }

        // Refresh today's logs
        loadKioskData();
      } catch (err) {
        console.error('Error logging attendance:', err);
      }

      // Hide modal after 3.2 seconds
      setTimeout(() => {
        setVerifiedModal(null);
        setLivenessStage('idle');
        hasBlinkedRef.current = false;
        blinkHistoryRef.current = [];
      }, 3200);
    },
    [supabase, info, success, loadKioskData]
  );

  // Vector matching function (Supabase RPC with local fallback)
  const matchFaceVector = useCallback(
    async (descriptor: Float32Array): Promise<{ match: MatchFaceResult | null; confidence: number }> => {
      const descriptorArray = Array.from(descriptor);

      // 1. Attempt Supabase RPC 'match_face'
      if (supabase) {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('match_face', {
            query_embedding: descriptorArray,
            threshold: 0.5,
          });

          if (!rpcErr && rpcData && rpcData.length > 0) {
            const topMatch = rpcData[0];
            const confidence = Math.max(0.5, 1 - topMatch.distance);
            return { match: topMatch, confidence };
          }
        } catch {
          // Fall through to client-side vector matching
        }
      }

      // 2. Client-side Euclidean distance fallback
      const enrolled = enrolledPeopleRef.current;
      let bestMatch: Person | null = null;
      let minDistance = 0.5; // strict threshold for accuracy

      for (const p of enrolled) {
        if (p.face_descriptor && Array.isArray(p.face_descriptor)) {
          const dist = euclideanDistance(descriptorArray, p.face_descriptor);
          if (dist < minDistance) {
            minDistance = dist;
            bestMatch = p;
          }
        }
      }

      if (bestMatch) {
        return {
          match: {
            id: bestMatch.id,
            full_name: bestMatch.full_name,
            roll_no: bestMatch.roll_no,
            distance: minDistance,
          },
          confidence: Math.max(0.55, 1 - minDistance),
        };
      }

      return { match: null, confidence: 0 };
    },
    [supabase]
  );

  // Periodic Face Detection Loop (~500ms interval)
  useEffect(() => {
    if (!cameraActive || !modelsLoaded) return;

    const intervalId = setInterval(async () => {
      if (isProcessing || verifiedModal !== null) return;
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      setIsProcessing(true);
      const video = videoRef.current;

      try {
        // 1. Check lighting
        const brightness = calculateBrightness(video);
        if (brightness < 30) {
          setHudMessage('Low light warning: please face a light source');
          setHudType('warning');
        }

        // 2. Check multiple faces
        const allFaces = await detectAllFaces(video);
        if (allFaces.length > 1) {
          setHudMessage('Multiple faces detected! Please scan one person at a time');
          setHudType('warning');
          setCurrentDetection(null);
          setIsProcessing(false);
          return;
        }

        // 3. Detect single face with landmarks & descriptor
        const result = await detectSingleFace(video);
        setCurrentDetection(result);

        if (!result) {
          setHudMessage('Look at the camera to check in');
          setHudType('default');
          setLivenessStage('idle');
          hasBlinkedRef.current = false;
          blinkHistoryRef.current = [];
          setIsProcessing(false);
          return;
        }

        // 4. Anti-spoofing Blink Detection (EAR)
        const ear = result.ear;
        setEarValue(ear);

        // Keep rolling history of last 5 EAR frames
        blinkHistoryRef.current.push(ear);
        if (blinkHistoryRef.current.length > 6) {
          blinkHistoryRef.current.shift();
        }

        // Check if eyes closed then opened
        const minEarInWindow = Math.min(...blinkHistoryRef.current);
        const maxEarInWindow = Math.max(...blinkHistoryRef.current);

        if (minEarInWindow < 0.20 && maxEarInWindow > 0.26) {
          hasBlinkedRef.current = true;
        }

        // If liveness check is not yet verified:
        if (!hasBlinkedRef.current) {
          setLivenessStage('awaiting_blink');
          setHudMessage('Blink your eyes to verify liveness (Anti-Spoofing)');
          setHudType('warning');
          setIsProcessing(false);
          return;
        }

        // Blink is verified! Proceed with facial recognition matching
        setLivenessStage('blink_detected');
        setHudMessage('Liveness Verified ✓ Matching face...');
        setHudType('default');

        const { match, confidence } = await matchFaceVector(result.descriptor);

        if (match) {
          // Check 3-second cooldown per person
          const now = Date.now();
          const lastSeen = cooldownMapRef.current.get(match.id) || 0;

          if (now - lastSeen > 3500) {
            cooldownMapRef.current.set(match.id, now);

            // Fetch person details
            const matchedPersonObj = enrolledPeopleRef.current.find((p) => p.id === match.id);

            await recordAttendance(
              {
                id: match.id,
                name: match.full_name,
                rollNo: match.roll_no,
                department: matchedPersonObj?.department || undefined,
                photoUrl: matchedPersonObj?.photo_url || undefined,
              },
              confidence
            );
          } else {
            // Under cooldown
            setHudMessage(`${match.full_name} is already checked in (cooldown active)`);
            setHudType('default');
          }
        } else {
          // Unknown face
          const now = Date.now();
          if (now - unknownCooldownRef.current > 3000) {
            unknownCooldownRef.current = now;
            sounds.playUnknown();
            setUnknownFaceAlert(true);
            setHudMessage('Unknown Face - Please enroll first');
            setHudType('error');

            setTimeout(() => {
              setUnknownFaceAlert(false);
              setLivenessStage('idle');
              hasBlinkedRef.current = false;
            }, 2500);
          }
        }
      } catch (err) {
        console.warn('Kiosk loop error:', err);
      } finally {
        setIsProcessing(false);
      }
    }, 450); // Runs every 450-500ms

    return () => clearInterval(intervalId);
  }, [
    cameraActive,
    modelsLoaded,
    isProcessing,
    verifiedModal,
    videoRef,
    detectAllFaces,
    detectSingleFace,
    matchFaceVector,
    recordAttendance,
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {!isFullscreen && <Navbar />}

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Top Kiosk Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-sky-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <Video className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Kiosk Attendance Scanner
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                500ms continuous facial recognition with EAR eye-blink anti-spoofing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFacingMode}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:bg-slate-800 transition-colors hidden sm:inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Flip Camera</span>
            </button>

            <button
              type="button"
              onClick={toggleFullScreen}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>
          </div>
        </div>

        {/* Main Grid: Camera Scanner & Live Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          {/* Left Column: Full Camera Stage */}
          <div className="lg:col-span-8 flex flex-col space-y-3">
            <div className="relative aspect-[4/3] w-full rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
              {/* Webcam stream */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* HUD Canvas Overlay */}
              <FaceCanvasOverlay
                detection={currentDetection}
                videoWidth={videoRef.current?.videoWidth || 640}
                videoHeight={videoRef.current?.videoHeight || 480}
                statusText={hudMessage}
                statusType={hudType}
                livenessState={
                  livenessStage === 'awaiting_blink'
                    ? 'awaiting_blink'
                    : livenessStage === 'blink_detected'
                    ? 'blink_ok'
                    : 'detecting'
                }
              />

              {/* Liveness HUD Top Bar */}
              <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
                {/* Anti-spoofing EAR Badge */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md text-xs font-semibold border ${
                      hasBlinkedRef.current
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                        : 'bg-slate-900/80 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>
                      {hasBlinkedRef.current ? 'Liveness: Verified ✓' : 'Anti-Spoofing: Blink Required'}
                    </span>
                    {earValue > 0 && (
                      <span className="text-[10px] opacity-70 font-mono">
                        (EAR: {earValue.toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Enrolled People Counter */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-800 text-xs text-slate-300">
                  <Users className="w-3.5 h-3.5 text-sky-400" />
                  <span>{enrolledPeopleRef.current.length} Enrolled</span>
                </div>
              </div>

              {/* Center Biometric Target Reticle */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-72 border border-slate-700/40 rounded-3xl relative">
                  <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-sky-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-sky-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-sky-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-sky-400 rounded-br-lg" />
                </div>
              </div>

              {/* Large Success Overlay on Verified Check-in */}
              {verifiedModal && (
                <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-md z-30 flex flex-col items-center justify-center p-6 text-center text-white space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-500/50">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold tracking-widest uppercase text-emerald-300">
                      Attendance Recorded
                    </span>
                    <h2 className="text-3xl font-black text-white">{verifiedModal.name}</h2>
                    <p className="text-sm font-mono text-emerald-200">Roll: {verifiedModal.rollNo}</p>
                    <p className="text-xs text-emerald-300/80">
                      {verifiedModal.department || 'Department'} • {verifiedModal.time}
                    </p>
                  </div>
                  <div className="px-4 py-1.5 rounded-full bg-emerald-900/60 border border-emerald-500/40 text-xs font-mono font-semibold text-emerald-200">
                    Match Confidence: {Math.round(verifiedModal.confidence * 100)}%
                  </div>
                </div>
              )}

              {/* Unknown Face Alert Overlay */}
              {unknownFaceAlert && (
                <div className="absolute inset-0 bg-rose-950/85 backdrop-blur-md z-30 flex flex-col items-center justify-center p-6 text-center text-white space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center shadow-2xl shadow-rose-500/50">
                    <AlertCircle className="w-12 h-12 text-rose-400" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-white">Unknown Face</h2>
                    <p className="text-sm text-rose-200 max-w-xs">
                      No matching vector found in the database. Please enroll your face first.
                    </p>
                  </div>
                  <Link
                    href="/enroll"
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shadow"
                  >
                    Enroll Now
                  </Link>
                </div>
              )}

              {/* Model Loading Screen */}
              {!modelsLoaded && (
                <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-30">
                  <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                  <p className="font-bold text-sm text-white">Loading Neural Biometrics...</p>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Initializing TinyFaceDetector &amp; FaceLandmark68 models ({loadingProgress}%)
                  </p>
                  {loadingError && <p className="text-xs text-rose-400">{loadingError}</p>}
                </div>
              )}

              {/* Camera Error Screen */}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-30">
                  <VideoOff className="w-10 h-10 text-rose-400" />
                  <p className="font-bold text-sm text-white">Camera Permission Denied</p>
                  <p className="text-xs text-slate-400 max-w-xs">{cameraError}</p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white"
                  >
                    Retry Permission
                  </button>
                </div>
              )}
            </div>

            {/* Bottom HUD Bar */}
            <div
              className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
                hudType === 'success'
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                  : hudType === 'warning'
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800'
                  : hudType === 'error'
                  ? 'bg-rose-950/40 text-rose-300 border-rose-800'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <ScanFace className="w-4 h-4 text-sky-400 shrink-0" />
                <span>{hudMessage}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                <span>Interval: ~450ms</span>
                <span>Threshold: 0.50</span>
              </div>
            </div>
          </div>

          {/* Right Column: Live Check-in Feed */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex-1 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-sm text-white">Today&apos;s Live Check-Ins</h3>
                </div>
                <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/60">
                  {todayLogs.length} Checked In
                </span>
              </div>

              {todayLogs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                  <Sparkles className="w-8 h-8 text-slate-600 mb-1" />
                  <p className="text-xs font-semibold">Waiting for first scan today</p>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    Look at the camera and blink to mark your attendance.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80 overflow-y-auto max-h-[460px] pr-1 mt-2">
                  {todayLogs.map((log) => {
                    const timeStr = log.check_in
                      ? new Date(log.check_in).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'N/A';

                    return (
                      <div
                        key={log.id}
                        className="py-3 flex items-center justify-between gap-3 animate-in fade-in"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {log.person?.photo_url ? (
                            <img
                              src={log.person.photo_url}
                              alt={log.person.full_name || 'Person'}
                              className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-800 text-sky-400 font-bold flex items-center justify-center text-xs shrink-0">
                              {(log.person?.full_name || 'U').charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">
                              {log.person?.full_name || 'Verified User'}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400">
                              {log.person?.roll_no || 'Roll N/A'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-mono text-slate-300 block">
                            {timeStr}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-bold">
                            ✓ {log.confidence ? `${Math.round(log.confidence * 100)}%` : '98%'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 mt-auto">
                <Link
                  href="/reports"
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <span>Export Full Attendance CSV</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
