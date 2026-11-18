import { msToX } from '@/features/loupe/model/loupeModel';
import type { LyricLine } from '@/types';

export const LOUPE_PALETTE = {
  waveBase: '#B5AEA3',
  waveActive: '#B53A22',
  lineMarker: 'rgba(92, 89, 100, 0.45)',
  playhead: '#25232B',
  zoomFill: 'rgba(181, 58, 34, 0.12)',
  zoomStroke: '#B53A22',
  selectionFill: 'rgba(181, 58, 34, 0.14)',
  selectionEdge: '#B53A22',
} as const;

export interface DrawPeaksOptions {
  width: number;
  height: number;
  peaks: readonly number[];
  durationMs: number;
  windowStartMs: number;
  windowEndMs: number;
  barCount: number;
  barGap?: number;
  color?: string;
}

/**
 * Dibuja las barras estáticas de la forma de onda para la ventana `[windowStartMs, windowEndMs]`.
 * Pensado para renderizar en un canvas offscreen cacheado cuando cambian dimensiones, picos o ventana.
 */
export function drawStaticWaveformPeaks(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    peaks,
    durationMs,
    windowStartMs,
    windowEndMs,
    barCount,
    barGap = 2,
    color = LOUPE_PALETTE.waveBase,
  }: DrawPeaksOptions,
): void {
  ctx.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0 || barCount <= 0) {
    return;
  }

  const safePeaks = peaks.length > 0 ? peaks : [0.25];
  const safeDuration = Math.max(1, durationMs);
  const span = Math.max(1, windowEndMs - windowStartMs);
  const barWidth = Math.max(1.5, (width - (barCount - 1) * barGap) / barCount);

  ctx.fillStyle = color;

  for (let i = 0; i < barCount; i++) {
    const sliceTimeMs = windowStartMs + ((i + 0.5) / barCount) * span;
    const globalRatio = Math.max(0, Math.min(0.9999, sliceTimeMs / safeDuration));
    const peakIndex = Math.floor(globalRatio * safePeaks.length);
    const amp = Math.max(0.08, Math.min(1, safePeaks[peakIndex] ?? 0.2));
    const barH = amp * (height * 0.84);
    const x = i * (barWidth + barGap);
    const y = (height - barH) / 2;
    const radius = Math.min(barWidth / 2, 2);

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, barWidth, barH, radius);
    } else {
      ctx.rect(x, y, barWidth, barH);
    }
    ctx.fill();
  }
}

export interface OverviewOverlayOptions {
  width: number;
  height: number;
  durationMs: number;
  currentTimeMs: number;
  lines: readonly LyricLine[];
  windowStartMs: number;
  windowEndMs: number;
}

/**
 * Dibuja la capa dinámica de la vista general: marcas de líneas, recuadro de zoom y cursor.
 */
export function drawOverviewOverlay(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    durationMs,
    currentTimeMs,
    lines,
    windowStartMs,
    windowEndMs,
  }: OverviewOverlayOptions,
): void {
  if (width <= 0 || height <= 0 || durationMs <= 0) {
    return;
  }

  // Marcas de inicio de cada línea sincronizada
  ctx.fillStyle = LOUPE_PALETTE.lineMarker;
  for (const line of lines) {
    if (line.startMs === null) {
      continue;
    }
    const x = msToX(line.startMs, 0, durationMs, width);
    ctx.fillRect(x, 2, 1.5, height - 4);
  }

  // Recuadro de ventana ampliada
  const boxX1 = msToX(windowStartMs, 0, durationMs, width);
  const boxX2 = msToX(windowEndMs, 0, durationMs, width);
  const boxW = Math.max(8, boxX2 - boxX1);
  ctx.fillStyle = LOUPE_PALETTE.zoomFill;
  ctx.strokeStyle = LOUPE_PALETTE.zoomStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(boxX1, 1, boxW, height - 2, 6);
  } else {
    ctx.rect(boxX1, 1, boxW, height - 2);
  }
  ctx.fill();
  ctx.stroke();

  // Cursor de reproducción
  const playX = msToX(currentTimeMs, 0, durationMs, width);
  ctx.fillStyle = LOUPE_PALETTE.playhead;
  ctx.fillRect(Math.max(0, playX - 1), 0, 2, height);
}

export interface LoupeOverlayOptions {
  width: number;
  height: number;
  windowStartMs: number;
  windowEndMs: number;
  lineStartMs: number;
  lineEndMs: number;
  currentTimeMs: number;
}

/**
 * Dibuja la capa dinámica de la lupa: región sombreada de la línea y cursor de reproducción.
 */
export function drawLoupeOverlay(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    windowStartMs,
    windowEndMs,
    lineStartMs,
    lineEndMs,
    currentTimeMs,
  }: LoupeOverlayOptions,
): void {
  if (width <= 0 || height <= 0 || windowEndMs <= windowStartMs) {
    return;
  }

  const startX = msToX(lineStartMs, windowStartMs, windowEndMs, width);
  const endX = msToX(lineEndMs, windowStartMs, windowEndMs, width);
  const regionW = Math.max(2, endX - startX);

  ctx.fillStyle = LOUPE_PALETTE.selectionFill;
  ctx.fillRect(startX, 0, regionW, height);

  ctx.fillStyle = LOUPE_PALETTE.selectionEdge;
  ctx.fillRect(startX, 0, 2, height);
  ctx.fillRect(Math.max(0, endX - 2), 0, 2, height);

  if (currentTimeMs >= windowStartMs && currentTimeMs <= windowEndMs) {
    const playX = msToX(currentTimeMs, windowStartMs, windowEndMs, width);
    ctx.fillStyle = LOUPE_PALETTE.playhead;
    ctx.fillRect(Math.max(0, playX - 1), 0, 2, height);
  }
}
