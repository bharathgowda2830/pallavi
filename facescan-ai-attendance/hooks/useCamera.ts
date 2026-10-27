'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface CameraOptions {
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
}

export function useCamera(options: CameraOptions = {}) {
  const { facingMode = 'user', width = 640, height = 480 } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [currentFacingMode, setCurrentFacingMode] = useState<'user' | 'environment'>(facingMode);

  // List available video input devices
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.warn('Could not enumerate camera devices:', err);
    }
  }, [selectedDeviceId]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera API is not supported in this browser.');
      return;
    }

    stopCamera();
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: width }, height: { ideal: height } }
          : { facingMode: currentFacingMode, width: { ideal: width }, height: { ideal: height } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setIsActive(true);
      setHasPermission(true);
      await refreshDevices();
    } catch (err: unknown) {
      console.error('Camera access error:', err);
      setHasPermission(false);
      setIsActive(false);

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission was denied. Please allow camera access in your browser settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera device found on this computer or phone.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError('Camera is in use by another application or tab.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Failed to start camera feed.');
      }
    }
  }, [selectedDeviceId, currentFacingMode, width, height, stopCamera, refreshDevices]);

  // Toggle front / back camera
  const toggleFacingMode = useCallback(() => {
    setCurrentFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Capture a crisp still image from the current video frame
  const captureFrame = useCallback(
    (targetWidth?: number, targetHeight?: number): { blob: Promise<Blob | null>; dataUrl: string } | null => {
      if (!videoRef.current || !isActive) return null;
      const video = videoRef.current;
      const w = targetWidth || video.videoWidth || 640;
      const h = targetHeight || video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Draw the video frame to canvas
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      const blobPromise = new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
      });

      return { blob: blobPromise, dataUrl };
    },
    [isActive]
  );

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    isActive,
    hasPermission,
    error,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    facingMode: currentFacingMode,
    startCamera,
    stopCamera,
    toggleFacingMode,
    captureFrame,
    refreshDevices,
  };
}
