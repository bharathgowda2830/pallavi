'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ScanFace,
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Sun,
  VideoOff,
  UserCheck,
  ChevronDown,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { FaceCanvasOverlay } from '@/components/FaceCanvasOverlay';
import { useFaceApi, DetectionResult, averageDescriptors, calculateBrightness } from '@/hooks/useFaceApi';
import { useCamera } from '@/hooks/useCamera';
import { useSupabase } from '@/hooks/useSupabase';
import { useToast } from '@/components/Toast';
import { sounds } from '@/lib/sound';
import type { Person } from '@/lib/supabase/types';

const TOTAL_SAMPLES = 5;

function EnrollContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get('personId');

  const { supabase, isConfigured } = useSupabase();
  const { success, error: toastError, info } = useToast();

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
    captureFrame,
  } = useCamera({ width: 640, height: 480 });

  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [currentDetection, setCurrentDetection] = useState<DetectionResult | null>(null);

  // Enrollment progress
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [capturedSamples, setCapturedSamples] = useState<Float32Array[]>([]);
  const [enrollmentComplete, setEnrollmentComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Select a person to begin face enrollment.');
  const [statusType, setStatusType] = useState<'default' | 'success' | 'warning' | 'error'>('default');
  const [bestPhotoDataUrl, setBestPhotoDataUrl] = useState<string | null>(null);
  const [savingToDb, setSavingToDb] = useState(false);

  const isEnrollingRef = useRef(false);
  isEnrollingRef.current = isEnrolling;

  // Fetch people list
  useEffect(() => {
    async function loadPeople() {
      if (!supabase) return;
      const { data } = await supabase.from('people').select('*').order('full_name');
      if (data) {
        setPeople(data as unknown as Person[]);
        if (preselectedId) {
          setSelectedPersonId(preselectedId);
        } else if (data.length > 0 && !selectedPersonId) {
          setSelectedPersonId(data[0].id);
        }
      }
    }
    loadPeople();
  }, [supabase, preselectedId, selectedPersonId]);

  // Start camera when models are loaded
  useEffect(() => {
    if (modelsLoaded && !cameraActive && !cameraError) {
      startCamera();
    }
  }, [modelsLoaded, cameraActive, cameraError, startCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Camera analysis loop for face detection in enrollment
  useEffect(() => {
    if (!cameraActive || !modelsLoaded) return;

    let isBusy = false;
    const interval = setInterval(async () => {
      if (isBusy || isEnrollingRef.current) return;
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      isBusy = true;
      const video = videoRef.current;

      try {
        // Check ambient brightness
        const brightness = calculateBrightness(video);
        if (brightness < 35) {
          setStatusMessage('Low lighting detected. Please face a light source.');
          setStatusType('warning');
        }

        // Check multiple faces
        const allFaces = await detectAllFaces(video);
        if (allFaces.length > 1) {
          setStatusMessage('Multiple faces detected! Please ensure only 1 person is in frame.');
          setStatusType('warning');
          setCurrentDetection(null);
          isBusy = false;
          return;
        }

        // Detect single face with descriptor
        const result = await detectSingleFace(video);
        setCurrentDetection(result);

        if (!result) {
          if (!isEnrollingRef.current) {
            setStatusMessage('Align your face within the frame.');
            setStatusType('default');
          }
        } else {
          if (!isEnrollingRef.current && !enrollmentComplete) {
            setStatusMessage('Face detected! Click "Start Enrollment" to capture 5 biometric samples.');
            setStatusType('default');
          }
        }
      } catch (err) {
        console.warn('Frame analysis error:', err);
      } finally {
        isBusy = false;
      }
    }, 400);

    return () => clearInterval(interval);
  }, [cameraActive, modelsLoaded, videoRef, detectAllFaces, detectSingleFace, enrollmentComplete]);

  // Capture step-by-step samples
  const startEnrollmentProcess = async () => {
    if (!selectedPersonId) {
      toastError('Please choose a person first.');
      return;
    }

    if (!videoRef.current || !currentDetection) {
      toastError('No face detected in camera! Please look directly at the lens.');
      return;
    }

    setIsEnrolling(true);
    setCapturedSamples([]);
    setEnrollmentComplete(false);
    setStatusType('warning');

    const samples: Float32Array[] = [];
    let photoUrlCandidate: string | null = null;

    // Capture first crisp snapshot photo for profile
    const frame = captureFrame(400, 400);
    if (frame) {
      photoUrlCandidate = frame.dataUrl;
      setBestPhotoDataUrl(frame.dataUrl);
    }

    for (let i = 1; i <= TOTAL_SAMPLES; i++) {
      setStatusMessage(`Capturing sample ${i} of ${TOTAL_SAMPLES}... Keep looking at the camera.`);
      sounds.playClick();

      // Wait 400ms between samples for slight micro-pose variety
      await new Promise((r) => setTimeout(r, 450));

      if (videoRef.current) {
        const detection = await detectSingleFace(videoRef.current);
        if (detection && detection.descriptor) {
          samples.push(new Float32Array(detection.descriptor));
          setCapturedSamples([...samples]);
        } else {
          // Retry sample once
          await new Promise((r) => setTimeout(r, 300));
          if (videoRef.current) {
            const retryDetection = await detectSingleFace(videoRef.current);
            if (retryDetection?.descriptor) {
              samples.push(new Float32Array(retryDetection.descriptor));
              setCapturedSamples([...samples]);
            }
          }
        }
      }
    }

    if (samples.length < 3) {
      setIsEnrolling(false);
      setStatusMessage('Enrollment failed: Unable to capture enough clear samples. Please try again.');
      setStatusType('error');
      toastError('Could not capture enough facial samples. Try adjusting lighting.');
      return;
    }

    // Average the 128-d vectors
    setStatusMessage('Averaging 128-d biometric vectors & generating descriptor...');
    const avgVector = averageDescriptors(samples);

    // Save to Supabase
    await saveEnrollmentToSupabase(selectedPersonId, avgVector, photoUrlCandidate);
    setIsEnrolling(false);
  };

  const saveEnrollmentToSupabase = async (
    personId: string,
    vector128: number[],
    photoDataUrl: string | null
  ) => {
    if (!supabase) return;

    setSavingToDb(true);
    try {
      let finalPhotoUrl = photoDataUrl;

      // Try uploading to Supabase Storage 'faces' bucket
      if (photoDataUrl) {
        try {
          const res = await fetch(photoDataUrl);
          const blob = await res.blob();
          const fileName = `person-${personId}-${Date.now()}.jpg`;

          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('faces')
            .upload(fileName, blob, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (!uploadErr && uploadData) {
            const { data: pubData } = supabase.storage
              .from('faces')
              .getPublicUrl(fileName);
            if (pubData?.publicUrl) {
              finalPhotoUrl = pubData.publicUrl;
            }
          }
        } catch {
          // If bucket upload fails (e.g. bucket doesn't exist), keep dataUrl as fallback
        }
      }

      // Update person record with vector(128)
      // Supabase pgvector accepts a JavaScript number array directly: [0.123, -0.456, ...]
      const { error: updateErr } = await supabase
        .from('people')
        .update({
          face_descriptor: vector128,
          photo_url: finalPhotoUrl,
        })
        .eq('id', personId);

      if (updateErr) throw updateErr;

      sounds.playSuccess();
      setEnrollmentComplete(true);
      setStatusMessage('Biometric enrollment complete! 128-d vector stored in database.');
      setStatusType('success');
      success('Face enrolled successfully!');

      // Update local state
      setPeople((prev) =>
        prev.map((p) =>
          p.id === personId
            ? { ...p, face_descriptor: vector128, photo_url: finalPhotoUrl }
            : p
        )
      );
    } catch (err: unknown) {
      console.error('Save enrollment error:', err);
      const msg = err instanceof Error ? err.message : 'Database update failed';
      setStatusMessage(`Error saving face vector: ${msg}`);
      setStatusType('error');
      toastError(`Failed to save face descriptor: ${msg}`);
    } finally {
      setSavingToDb(false);
    }
  };

  const selectedPerson = people.find((p) => p.id === selectedPersonId);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <ScanFace className="w-4 h-4" />
              <span>Biometric Registration</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
              Enroll Facial Descriptor
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Captures 5 high-precision facial geometry samples and averages 128-d pgvector embeddings.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/attendance"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-semibold transition-colors"
            >
              <span>Test in Kiosk</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Setup check banner */}
        {!isConfigured && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
            <span>Supabase is not connected. Vector descriptors will not be saved to the database.</span>
            <Link href="/setup" className="font-semibold underline">
              Configure Supabase
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Live Camera & HUD */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center">
              {/* HTML5 Video */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* Biometric Canvas Overlay */}
              <FaceCanvasOverlay
                detection={currentDetection}
                videoWidth={videoRef.current?.videoWidth || 640}
                videoHeight={videoRef.current?.videoHeight || 480}
                statusText={statusMessage}
                statusType={statusType}
                isScanning={!enrollmentComplete}
              />

              {/* Loading Face-API models overlay */}
              {!modelsLoaded && (
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white space-y-3 z-20">
                  <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                  <p className="font-semibold text-sm">Loading Neural Face Models...</p>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Initializing TinyFaceDetector &amp; FaceRecognitionNet weights ({loadingProgress}%)
                  </p>
                  {loadingError && (
                    <p className="text-xs text-rose-400 mt-2">{loadingError}</p>
                  )}
                </div>
              )}

              {/* Camera permission error overlay */}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white space-y-3 z-20">
                  <VideoOff className="w-10 h-10 text-rose-400" />
                  <p className="font-semibold text-sm">Camera Inaccessible</p>
                  <p className="text-xs text-slate-400 max-w-xs">{cameraError}</p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold"
                  >
                    Retry Camera
                  </button>
                </div>
              )}

              {/* Top Camera Status Pill */}
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-medium border border-slate-700/60 shadow">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      currentDetection ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'
                    }`}
                  />
                  <span>{currentDetection ? 'Face Locked' : 'Searching Face'}</span>
                </span>
              </div>
            </div>

            {/* Status notification bar under video */}
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                statusType === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : statusType === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  : statusType === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {statusType === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : statusType === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                ) : (
                  <ScanFace className="w-4 h-4 text-sky-500 shrink-0" />
                )}
                <span className="font-medium">{statusMessage}</span>
              </div>

              {currentDetection && (
                <span className="font-mono text-[11px] text-slate-500">
                  EAR: {currentDetection.ear.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Right Column: Controls, Person Selection & Sample Progress */}
          <div className="lg:col-span-5 space-y-6">
            {/* Person selector card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-sky-500" />
                <span>1. Select Person to Enroll</span>
              </h2>

              {people.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center space-y-2">
                  <p className="text-xs text-slate-500">No people found in the directory.</p>
                  <Link
                    href="/people"
                    className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 font-semibold underline"
                  >
                    Add a person first
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <select
                      value={selectedPersonId}
                      onChange={(e) => {
                        setSelectedPersonId(e.target.value);
                        setEnrollmentComplete(false);
                        setCapturedSamples([]);
                      }}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 pr-10"
                    >
                      {people.map((p) => {
                        const hasFace = Array.isArray(p.face_descriptor) && p.face_descriptor.length > 0;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.full_name} ({p.roll_no}) {hasFace ? '✓ Enrolled' : '• Needs Scan'}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                  </div>

                  {selectedPerson && (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                      {selectedPerson.photo_url ? (
                        <img
                          src={selectedPerson.photo_url}
                          alt={selectedPerson.full_name}
                          className="w-12 h-12 rounded-full object-cover border border-slate-300 dark:border-slate-600"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold flex items-center justify-center text-base border border-sky-500/20">
                          {selectedPerson.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {selectedPerson.full_name}
                        </p>
                        <p className="text-xs text-slate-500 font-mono">
                          Roll: {selectedPerson.roll_no}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {selectedPerson.department || 'General Department'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 5-Sample Progress & Trigger Button */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-500" />
                <span>2. Multi-Sample Capture</span>
              </h2>

              <p className="text-xs text-slate-500 leading-relaxed">
                Capturing 5 varied frames produces a noise-resistant 128-dimensional mathematical centroid embedding.
              </p>

              {/* 5 dots indicator */}
              <div className="grid grid-cols-5 gap-2 pt-1">
                {Array.from({ length: TOTAL_SAMPLES }).map((_, idx) => {
                  const isCaptured = capturedSamples.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                        isCaptured
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isCaptured ? `✓ #${idx + 1}` : `#${idx + 1}`}
                    </div>
                  );
                })}
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={startEnrollmentProcess}
                  disabled={
                    !modelsLoaded ||
                    !cameraActive ||
                    isEnrolling ||
                    savingToDb ||
                    !selectedPersonId ||
                    !currentDetection
                  }
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-lg shadow-sky-600/25 transition-all cursor-pointer"
                >
                  {isEnrolling || savingToDb ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{savingToDb ? 'Storing in pgvector...' : 'Capturing Facial Samples...'}</span>
                    </>
                  ) : enrollmentComplete ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                      <span>Re-Enroll Face</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>Start 5-Sample Enrollment</span>
                    </>
                  )}
                </button>
              </div>

              {enrollmentComplete && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-2 text-center animate-in fade-in">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Facial Embedding Registered!
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    {selectedPerson?.full_name} can now verify in Kiosk Mode in under 500ms.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-3">
                    <Link
                      href="/attendance"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                    >
                      <span>Launch Kiosk</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function EnrollPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Loading enrollment...</div>}>
      <EnrollContent />
    </React.Suspense>
  );
}

