'use client';

import React, { useEffect, useRef } from 'react';
import type { DetectionResult } from '@/hooks/useFaceApi';

interface FaceCanvasOverlayProps {
  detection: DetectionResult | null;
  videoWidth: number;
  videoHeight: number;
  statusText?: string;
  statusType?: 'default' | 'success' | 'warning' | 'error';
  livenessState?: 'detecting' | 'awaiting_blink' | 'blink_ok' | 'cooldown';
  isScanning?: boolean;
}

export function FaceCanvasOverlay({
  detection,
  videoWidth,
  videoHeight,
  statusText,
  statusType = 'default',
  livenessState,
  isScanning = true,
}: FaceCanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!detection) {
      // Draw centered scan guide frame if no face yet
      if (isScanning && videoWidth > 0 && videoHeight > 0) {
        const guideW = Math.min(videoWidth * 0.45, 260);
        const guideH = guideW * 1.3;
        const gx = (videoWidth - guideW) / 2;
        const gy = (videoHeight - guideH) / 2 - 20;

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(gx, gy, guideW, guideH);
        ctx.setLineDash([]);

        // Biometric corners
        const cornerLen = 22;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 3;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(gx, gy + cornerLen);
        ctx.lineTo(gx, gy);
        ctx.lineTo(gx + cornerLen, gy);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(gx + guideW - cornerLen, gy);
        ctx.lineTo(gx + guideW, gy);
        ctx.lineTo(gx + guideW, gy + cornerLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(gx, gy + guideH - cornerLen);
        ctx.lineTo(gx, gy + guideH);
        ctx.lineTo(gx + cornerLen, gy + guideH);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(gx + guideW - cornerLen, gy + guideH);
        ctx.lineTo(gx + guideW, gy + guideH);
        ctx.lineTo(gx + guideW, gy + guideH - cornerLen);
        ctx.stroke();
      }
      return;
    }

    const { box, landmarks, ear, isBlinking } = detection;

    // Pick box color based on status and liveness
    let strokeColor = '#38bdf8'; // sky
    let fillColor = 'rgba(56, 189, 248, 0.12)';

    if (statusType === 'success' || livenessState === 'blink_ok') {
      strokeColor = '#10b981'; // emerald
      fillColor = 'rgba(16, 185, 129, 0.18)';
    } else if (statusType === 'error') {
      strokeColor = '#f43f5e'; // rose
      fillColor = 'rgba(244, 63, 94, 0.18)';
    } else if (statusType === 'warning' || livenessState === 'awaiting_blink') {
      strokeColor = '#f59e0b'; // amber
      fillColor = 'rgba(245, 158, 11, 0.14)';
    }

    // Draw bounding box
    ctx.fillStyle = fillColor;
    ctx.fillRect(box.x, box.y, box.width, box.height);

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // Draw high-tech HUD corner brackets
    const cSize = Math.min(24, box.width * 0.2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = strokeColor;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + cSize);
    ctx.lineTo(box.x, box.y);
    ctx.lineTo(box.x + cSize, box.y);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(box.x + box.width - cSize, box.y);
    ctx.lineTo(box.x + box.width, box.y);
    ctx.lineTo(box.x + box.width, box.y + cSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.height - cSize);
    ctx.lineTo(box.x, box.y + box.height);
    ctx.lineTo(box.x + cSize, box.y + box.height);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(box.x + box.width - cSize, box.y + box.height);
    ctx.lineTo(box.x + box.width, box.y + box.height);
    ctx.lineTo(box.x + box.width, box.y + box.height - cSize);
    ctx.stroke();

    // Draw subtle eye landmark points
    if (landmarks && landmarks.positions) {
      // Draw eyes & nose landmarks for biometric verification feel
      ctx.fillStyle = isBlinking ? '#f59e0b' : 'rgba(56, 189, 248, 0.8)';
      // Eye points 36..47
      for (let i = 36; i <= 47; i++) {
        const pt = landmarks.positions[i];
        if (pt) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    // Draw label tag above box
    const label = statusText || (isBlinking ? 'Blink Detected' : `EAR: ${ear.toFixed(2)}`);
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(label).width;
    const tagH = 24;
    const tagW = textWidth + 20;
    const tagY = Math.max(0, box.y - tagH - 4);

    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.roundRect(box.x, tagY, tagW, tagH, 6);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.fillText(label, box.x + 10, tagY + 16);
  }, [detection, videoWidth, videoHeight, statusText, statusType, livenessState, isScanning]);

  return (
    <canvas
      ref={canvasRef}
      width={videoWidth || 640}
      height={videoHeight || 480}
      className="absolute inset-0 w-full h-full pointer-events-none object-cover"
    />
  );
}
