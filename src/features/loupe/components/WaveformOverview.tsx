import { useCallback } from 'react';
import { useCachedWaveformCanvas } from '@/features/loupe/hooks/useCachedWaveformCanvas';
import type { ZoomWindow } from '@/features/loupe/model/loupeModel';
import { drawOverviewOverlay } from '@/features/loupe/utils/waveformCanvas';
import type { LyricLine } from '@/types';
import { WellPanel } from '@/ui';

export interface WaveformOverviewProps {
  peaks: readonly number[];
  durationMs: number;
  currentTimeMs: number;
  lines: readonly LyricLine[];
  zoomWindow: ZoomWindow;
  className?: string;
}

/**
 * Vista general de la forma de onda completa con marcas de líneas,
 * cursor de reproducción y recuadro de la ventana ampliada en la lupa.
 */
export function WaveformOverview({
  peaks,
  durationMs,
  currentTimeMs,
  lines,
  zoomWindow,
  className = '',
}: WaveformOverviewProps) {
  const drawOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      drawOverviewOverlay(ctx, {
        width,
        height,
        durationMs,
        currentTimeMs,
        lines,
        windowStartMs: zoomWindow.windowStartMs,
        windowEndMs: zoomWindow.windowEndMs,
      });
    },
    [
      durationMs,
      currentTimeMs,
      lines,
      zoomWindow.windowStartMs,
      zoomWindow.windowEndMs,
    ],
  );

  const { canvasRef } = useCachedWaveformCanvas({
    peaks,
    durationMs,
    windowStartMs: 0,
    windowEndMs: Math.max(1, durationMs),
    barCount: 72,
    barGap: 2,
    drawOverlay,
  });

  return (
    <WellPanel className={`px-3 py-2.5 flex flex-col gap-1.5 ${className}`.trim()}>
      <div className="relative h-[38px] w-full">
        <canvas
          ref={canvasRef}
          aria-label="Vista general de la forma de onda"
          className="block w-full h-full rounded-lg"
        />
      </div>
      <div className="flex items-center justify-between font-mono text-[11px] font-bold text-mute tabular-nums">
        <span>Vista general</span>
        <span>zona ampliada ↓</span>
      </div>
    </WellPanel>
  );
}
