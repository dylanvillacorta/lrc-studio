import { useEffect, useRef, useState } from 'react';
import { drawStaticWaveformPeaks } from '@/features/loupe/utils/waveformCanvas';

export interface UseCachedWaveformCanvasOptions {
  peaks: readonly number[];
  durationMs: number;
  windowStartMs: number;
  windowEndMs: number;
  barCount: number;
  barGap?: number;
  drawOverlay: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void;
}

/**
 * Gestiona un `<canvas>` con `devicePixelRatio` y cachea la forma de onda estática
 * en un canvas offscreen para no recalcular barras en cada frame de reproducción.
 */
export function useCachedWaveformCanvas({
  peaks,
  durationMs,
  windowStartMs,
  windowEndMs,
  barCount,
  barGap = 2,
  drawOverlay,
}: UseCachedWaveformCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticCacheRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Medición responsiva del contenedor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(0, Math.round(rect.width));
      const nextHeight = Math.max(0, Math.round(rect.height));
      setSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Cache estático de barras de forma de onda
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0 || typeof document === 'undefined') {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const cache = staticCacheRef.current ?? document.createElement('canvas');
    staticCacheRef.current = cache;

    cache.width = Math.round(size.width * dpr);
    cache.height = Math.round(size.height * dpr);

    const cacheCtx = cache.getContext('2d');
    if (!cacheCtx) {
      return;
    }
    cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStaticWaveformPeaks(cacheCtx, {
      width: size.width,
      height: size.height,
      peaks,
      durationMs,
      windowStartMs,
      windowEndMs,
      barCount,
      barGap,
    });
  }, [
    size.width,
    size.height,
    peaks,
    durationMs,
    windowStartMs,
    windowEndMs,
    barCount,
    barGap,
  ]);

  // Pintado compuesto: copia la onda estática cacheada y dibuja el overlay dinámico
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(size.width * dpr);
    const targetH = Math.round(size.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, targetW, targetH);

    const cache = staticCacheRef.current;
    if (cache && cache.width > 0 && cache.height > 0) {
      ctx.drawImage(cache, 0, 0, targetW, targetH);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlay(ctx, size.width, size.height);
  }, [
    size.width,
    size.height,
    peaks,
    durationMs,
    windowStartMs,
    windowEndMs,
    barCount,
    barGap,
    drawOverlay,
  ]);

  return {
    canvasRef,
    width: size.width,
    height: size.height,
  };
}
