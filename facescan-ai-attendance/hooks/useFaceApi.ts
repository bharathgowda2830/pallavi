'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type * as faceapiType from '@vladmandic/face-api';

interface Point {
  x: number;
  y: number;
}

export interface DetectionResult {
  detection: faceapiType.FaceDetection;
  landmarks: faceapiType.FaceLandmarks68;
  descriptor: Float32Array;
  ear: number;
  isBlinking: boolean;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Eye Aspect Ratio (EAR) calculation from 68 landmarks
export function calculateEAR(landmarks: faceapiType.FaceLandmarks68): { leftEar: number; rightEar: number; avgEar: number } {
  const points = landmarks.positions;

  function distance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  function getEyeEar(indices: number[]): number {
    const [p1, p2, p3, p4, p5, p6] = indices.map((i) => points[i]);
    const vertical1 = distance(p2, p6);
    const vertical2 = distance(p3, p5);
    const horizontal = distance(p1, p4);
    if (horizontal === 0) return 0;
    return (vertical1 + vertical2) / (2.0 * horizontal);
  }

  // Left eye points (36 to 41)
  const leftEar = getEyeEar([36, 37, 38, 39, 40, 41]);
  // Right eye points (42 to 47)
  const rightEar = getEyeEar([42, 43, 44, 45, 46, 47]);
  const avgEar = (leftEar + rightEar) / 2;

  return { leftEar, rightEar, avgEar };
}

// Calculate image brightness (0 to 255)
export function calculateBrightness(video: HTMLVideoElement): number {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 120;
    ctx.drawImage(video, 0, 0, 64, 48);
    const imageData = ctx.getImageData(0, 0, 64, 48);
    const data = imageData.data;
    let colorSum = 0;
    for (let x = 0; x < data.length; x += 4) {
      // Perceived luminance formula
      colorSum += 0.299 * data[x] + 0.587 * data[x + 1] + 0.114 * data[x + 2];
    }
    return Math.floor(colorSum / (64 * 48));
  } catch {
    return 120;
  }
}

// Average multiple 128-d face descriptors
export function averageDescriptors(descriptors: Float32Array[]): number[] {
  if (descriptors.length === 0) return [];
  const dim = descriptors[0].length;
  const avg = new Array(dim).fill(0);

  for (const desc of descriptors) {
    for (let i = 0; i < dim; i++) {
      avg[i] += desc[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    avg[i] = Number((avg[i] / descriptors.length).toFixed(6));
  }

  return avg;
}

// Euclidean distance between two 128-d vectors
export function euclideanDistance(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function useFaceApi() {
  const [faceapi, setFaceapi] = useState<typeof faceapiType | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function loadModels() {
      if (typeof window === 'undefined' || isInitializingRef.current || isLoaded) return;
      isInitializingRef.current = true;

      try {
        setLoadingProgress(15);
        const api = await import('@vladmandic/face-api');

        if (!isMounted) return;
        setLoadingProgress(35);

        // Configure tfjs backend for optimal browser performance if available
        try {
          if (typeof (api.tf as any)?.setBackend === 'function') {
            await (api.tf as any).setBackend('webgl').catch(async () => {
              await (api.tf as any).setBackend('cpu').catch(() => {});
            });
          }
        } catch {
          // Backend auto-initializes
        }

        // Try local models first, fallback to CDN if needed
        const MODEL_URL = '/models';
        const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

        try {
          await Promise.all([
            api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          ]);
        } catch (localErr) {
          console.warn('Local models failed to load, falling back to CDN...', localErr);
          await Promise.all([
            api.nets.tinyFaceDetector.loadFromUri(CDN_URL),
            api.nets.faceLandmark68Net.loadFromUri(CDN_URL),
            api.nets.faceRecognitionNet.loadFromUri(CDN_URL),
          ]);
        }

        if (isMounted) {
          setFaceapi(api);
          setIsLoaded(true);
          setLoadingProgress(100);
          setLoadingError(null);
        }
      } catch (err: unknown) {
        console.error('Failed to load Face-API models:', err);
        if (isMounted) {
          setLoadingError(err instanceof Error ? err.message : 'Unknown error loading face models');
        }
      } finally {
        isInitializingRef.current = false;
      }
    }

    loadModels();

    return () => {
      isMounted = false;
    };
  }, [isLoaded]);

  // Detect single face with landmarks & descriptor
  const detectSingleFace = useCallback(
    async (
      videoOrCanvas: HTMLVideoElement | HTMLCanvasElement,
      scoreThreshold = 0.5
    ): Promise<DetectionResult | null> => {
      if (!faceapi || !isLoaded) return null;

      try {
        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold,
        });

        const result = await faceapi
          .detectSingleFace(videoOrCanvas, options)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!result) return null;

        const { avgEar } = calculateEAR(result.landmarks);
        const isBlinking = avgEar < 0.20;

        return {
          detection: result.detection,
          landmarks: result.landmarks,
          descriptor: result.descriptor,
          ear: avgEar,
          isBlinking,
          box: {
            x: result.detection.box.x,
            y: result.detection.box.y,
            width: result.detection.box.width,
            height: result.detection.box.height,
          },
        };
      } catch (err) {
        console.error('Face detection error:', err);
        return null;
      }
    },
    [faceapi, isLoaded]
  );

  // Detect all faces in frame (to identify multiple people)
  const detectAllFaces = useCallback(
    async (videoOrCanvas: HTMLVideoElement | HTMLCanvasElement) => {
      if (!faceapi || !isLoaded) return [];

      try {
        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.45,
        });

        return await faceapi.detectAllFaces(videoOrCanvas, options);
      } catch (err) {
        console.error('Detect all faces error:', err);
        return [];
      }
    },
    [faceapi, isLoaded]
  );

  return {
    faceapi,
    isLoaded,
    loadingError,
    loadingProgress,
    detectSingleFace,
    detectAllFaces,
    calculateEAR,
    calculateBrightness,
    averageDescriptors,
  };
}
