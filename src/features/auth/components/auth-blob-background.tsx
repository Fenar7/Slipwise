"use client";

import { useEffect, useRef } from "react";

type AuthBlobVariant = "red" | "purple";

const PALETTES: Record<AuthBlobVariant, {
  ribbonOuter: string;
  ribbonCore: string;
  diagOuter: string;
  diagCore: string;
  orbInner: string;
  orbMid: string;
  orbOuter: string;
  shadow: string;
}> = {
  red: {
    ribbonOuter: "254,226,226",
    ribbonCore: "220,38,38",
    diagOuter: "252,165,165",
    diagCore: "220,38,38",
    orbInner: "255,245,245",
    orbMid: "248,113,113",
    orbOuter: "220,38,38",
    shadow: "220,38,38",
  },
  purple: {
    ribbonOuter: "243,210,230",
    ribbonCore: "192,80,146",
    diagOuter: "232,165,200",
    diagCore: "192,80,146",
    orbInner: "252,240,247",
    orbMid: "220,130,180",
    orbOuter: "192,80,146",
    shadow: "192,80,146",
  },
};

interface AuthBlobBackgroundProps {
  variant?: AuthBlobVariant;
}

export function AuthBlobBackground({ variant = "red" }: AuthBlobBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = PALETTES[variant];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) return;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastDraw = 0;
    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawWaveRibbon = (
      time: number,
      yBase: number,
      amplitude: number,
      frequency: number,
      phase: number,
      thickness: number,
      alpha: number,
    ) => {
      const gradient = context.createLinearGradient(0, yBase - amplitude - thickness, 0, yBase + amplitude + thickness);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.25, `rgba(${palette.ribbonOuter},${alpha * 0.5})`);
      gradient.addColorStop(0.5, `rgba(${palette.ribbonCore},${alpha})`);
      gradient.addColorStop(0.75, `rgba(${palette.ribbonOuter},${alpha * 0.5})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");

      context.save();
      context.globalAlpha = 1;
      context.shadowBlur = 18;
      context.shadowColor = `rgba(${palette.shadow},${alpha * 0.35})`;
      context.fillStyle = gradient;
      context.beginPath();

      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * width;
        const y = yBase + Math.sin(x * frequency + time + phase) * amplitude + Math.sin(x * frequency * 0.6 + time * 0.8 + phase * 1.3) * amplitude * 0.4;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const x = (i / steps) * width;
        const y = yBase + Math.sin(x * frequency + time + phase) * amplitude + Math.sin(x * frequency * 0.6 + time * 0.8 + phase * 1.3) * amplitude * 0.4 + thickness;
        context.lineTo(x, y);
      }

      context.closePath();
      context.fill();
      context.restore();
    };

    const drawDiagonalWave = (
      time: number,
      xBase: number,
      yBase: number,
      amplitude: number,
      frequency: number,
      phase: number,
      thickness: number,
      alpha: number,
      angle = 0.35,
    ) => {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const diagLen = Math.sqrt(width * width + height * height);
      const steps = 18;

      const gradient = context.createLinearGradient(
        xBase - diagLen * cosA * 0.3,
        yBase - diagLen * sinA * 0.3,
        xBase + diagLen * cosA * 0.3,
        yBase + diagLen * sinA * 0.3,
      );
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.3, `rgba(${palette.diagOuter},${alpha * 0.55})`);
      gradient.addColorStop(0.5, `rgba(${palette.diagCore},${alpha})`);
      gradient.addColorStop(0.7, `rgba(${palette.diagOuter},${alpha * 0.55})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");

      context.save();
      context.shadowBlur = 20;
      context.shadowColor = `rgba(${palette.shadow},${alpha * 0.3})`;
      context.fillStyle = gradient;
      context.beginPath();

      for (let i = 0; i <= steps; i++) {
        const t = (i / steps - 0.5) * diagLen;
        const wave = Math.sin(t * frequency + time + phase) * amplitude + Math.sin(t * frequency * 0.5 + time * 0.7) * amplitude * 0.35;
        const x = xBase + t * cosA - wave * sinA;
        const y = yBase + t * sinA + wave * cosA;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const t = (i / steps - 0.5) * diagLen;
        const wave = Math.sin(t * frequency + time + phase) * amplitude + Math.sin(t * frequency * 0.5 + time * 0.7) * amplitude * 0.35;
        const x = xBase + t * cosA - (wave + thickness) * sinA;
        const y = yBase + t * sinA + (wave + thickness) * cosA;
        context.lineTo(x, y);
      }

      context.closePath();
      context.fill();
      context.restore();
    };

    const drawOrb = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      alpha: number,
      time: number,
      phase: number,
    ) => {
      const steps = 16;
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const morph = 1 + Math.sin(angle * 3 + time * 0.6 + phase) * 0.18 + Math.cos(angle * 5 - time * 0.4 + phase * 0.8) * 0.12;
        points.push({
          x: cx + Math.cos(angle) * rx * morph + Math.sin(time * 0.3 + phase) * rx * 0.06,
          y: cy + Math.sin(angle) * ry * morph + Math.cos(time * 0.25 + phase) * ry * 0.05,
        });
      }

      const gradient = context.createRadialGradient(cx - rx * 0.1, cy - ry * 0.1, 0, cx, cy, Math.max(rx, ry));
      gradient.addColorStop(0, `rgba(${palette.orbInner},${alpha})`);
      gradient.addColorStop(0.5, `rgba(${palette.orbMid},${alpha * 0.8})`);
      gradient.addColorStop(1, `rgba(${palette.orbOuter},0)`);

      context.save();
      context.shadowBlur = 16;
      context.shadowColor = `rgba(${palette.shadow},${alpha * 0.25})`;
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 0; i < steps; i++) {
        const c = points[i]!;
        const n = points[(i + 1) % steps]!;
        context.quadraticCurveTo(c.x, c.y, (c.x + n.x) / 2, (c.y + n.y) / 2);
      }
      context.closePath();
      context.fill();
      context.restore();
    };

    const render = (timestamp: number) => {
      frameId = window.requestAnimationFrame(render);
      if (timestamp - lastDraw < FRAME_INTERVAL) return;
      lastDraw = timestamp;

      const time = timestamp * 0.001;
      context.clearRect(0, 0, width, height);

      drawOrb(
        width * 0.45 + Math.sin(time * 0.2) * width * 0.04,
        height * 0.48 + Math.cos(time * 0.18) * height * 0.03,
        width * 0.28,
        height * 0.22,
        0.28,
        time,
        0,
      );
      drawOrb(
        width * 0.58 + Math.cos(time * 0.24) * width * 0.05,
        height * 0.52 + Math.sin(time * 0.2) * height * 0.04,
        width * 0.22,
        height * 0.28,
        0.22,
        time,
        2.5,
      );

      drawWaveRibbon(time * 0.9, height * 0.32, height * 0.07, 0.008, 0, height * 0.14, 0.42);
      drawWaveRibbon(time * 1.1, height * 0.52, height * 0.09, 0.006, 2.2, height * 0.18, 0.50);

      drawDiagonalWave(time * 0.7, width * 0.35, height * 0.4, height * 0.05, 0.007, 1.0, height * 0.10, 0.32, 0.25);

      drawOrb(
        width * 0.38 + Math.sin(time * 0.45) * width * 0.03,
        height * 0.35 + Math.cos(time * 0.38) * height * 0.025,
        width * 0.10,
        height * 0.08,
        0.45,
        time,
        1.2,
      );
      drawOrb(
        width * 0.62 + Math.cos(time * 0.5) * width * 0.035,
        height * 0.60 + Math.sin(time * 0.42) * height * 0.03,
        width * 0.08,
        height * 0.10,
        0.38,
        time,
        3.8,
      );
    };

    resize();
    frameId = window.requestAnimationFrame(render);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [palette]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 h-[96%] w-[98%] max-h-[1000px] max-w-[1200px] -translate-x-1/2 -translate-y-1/2">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      <div
        className="absolute left-1/2 top-1/2 h-[98%] w-[99%] max-h-[1040px] max-w-[1240px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 0%, rgba(255,255,255,0.02) 22%, rgba(255,255,255,0.12) 58%, rgba(255,255,255,0.82) 100%)",
        }}
      />
    </div>
  );
}
