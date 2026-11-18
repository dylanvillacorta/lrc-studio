import { useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCachedWaveformCanvas } from '@/features/loupe/hooks/useCachedWaveformCanvas';
import { useDragHandle } from '@/features/loupe/hooks/useDragHandle';
import {
  MIN_LINE_DURATION_MS,
  applyInspectorDelta,
  computeDraggedEdge,
  xToMs,
  type LineBounds,
  type ZoomWindow,
} from '@/features/loupe/model/loupeModel';
import { drawLoupeOverlay } from '@/features/loupe/utils/waveformCanvas';
import { formatTime } from '@/lib/time';
import { Pill, WellPanel } from '@/ui';

export interface LoupeViewProps {
  peaks: readonly number[];
  durationMs: number;
  currentTimeMs: number;
  zoomWindow: ZoomWindow;
  onChange: (bounds: LineBounds) => void;
  snapStepMs?: number;
  className?: string;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Lupa de onda ampliada con región sombreada de la línea activa y dos bordes
 * arrastrables por dedo, ratón o teclado (`±10 ms` y `Shift ±50 ms`).
 */
export function LoupeView({
  peaks,
  durationMs,
  currentTimeMs,
  zoomWindow,
  onChange,
  snapStepMs,
  className = '',
}: LoupeViewProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cancelSnapshotRef = useRef<LineBounds | null>(null);

  const { windowStartMs, windowEndMs, lineStartMs, lineEndMs, spanMs, zoomFactor } =
    zoomWindow;

  const clientXToMs = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return lineStartMs;
      }
      return xToMs(clientX - rect.left, windowStartMs, windowEndMs, rect.width);
    },
    [lineStartMs, windowEndMs, windowStartMs],
  );

  const handleDragStart = useCallback(() => {
    cancelSnapshotRef.current = { startMs: lineStartMs, endMs: lineEndMs };
  }, [lineEndMs, lineStartMs]);

  const handleDragCancel = useCallback(() => {
    if (cancelSnapshotRef.current) {
      onChange(cancelSnapshotRef.current);
      cancelSnapshotRef.current = null;
    }
  }, [onChange]);

  const startDrag = useDragHandle({
    clientXToMs,
    onDragStart: handleDragStart,
    onDrag: (targetMs) => {
      onChange(
        computeDraggedEdge({
          edge: 'start',
          targetMs,
          startMs: lineStartMs,
          endMs: lineEndMs,
          durationMs,
          snapStepMs,
        }),
      );
    },
    onDragEnd: () => {
      cancelSnapshotRef.current = null;
    },
    onDragCancel: handleDragCancel,
  });

  const endDrag = useDragHandle({
    clientXToMs,
    onDragStart: handleDragStart,
    onDrag: (targetMs) => {
      onChange(
        computeDraggedEdge({
          edge: 'end',
          targetMs,
          startMs: lineStartMs,
          endMs: lineEndMs,
          durationMs,
          snapStepMs,
        }),
      );
    },
    onDragEnd: () => {
      cancelSnapshotRef.current = null;
    },
    onDragCancel: handleDragCancel,
  });

  const handleKeyDown = useCallback(
    (field: 'start' | 'end') => (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      const step = event.shiftKey ? 50 : 10;
      const deltaMs = event.key === 'ArrowLeft' ? -step : step;
      onChange(
        applyInspectorDelta(
          { startMs: lineStartMs, endMs: lineEndMs },
          field,
          deltaMs,
          durationMs,
        ),
      );
    },
    [durationMs, lineEndMs, lineStartMs, onChange],
  );

  const drawOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      drawLoupeOverlay(ctx, {
        width,
        height,
        windowStartMs,
        windowEndMs,
        lineStartMs,
        lineEndMs,
        currentTimeMs,
      });
    },
    [currentTimeMs, lineEndMs, lineStartMs, windowEndMs, windowStartMs],
  );

  const { canvasRef } = useCachedWaveformCanvas({
    peaks,
    durationMs,
    windowStartMs,
    windowEndMs: Math.max(windowStartMs + 1, windowEndMs),
    barCount: 64,
    barGap: 2,
    drawOverlay,
  });

  const safeSpan = Math.max(1, spanMs);
  const startPercent = Math.max(
    0,
    Math.min(100, ((lineStartMs - windowStartMs) / safeSpan) * 100),
  );
  const endPercent = Math.max(
    0,
    Math.min(100, ((lineEndMs - windowStartMs) / safeSpan) * 100),
  );

  return (
    <WellPanel className={`px-3.5 pt-4 pb-3 flex flex-col gap-2.5 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold tracking-[0.1em] text-mute">
          LUPA · ARRASTRA LOS BORDES
        </span>
        <Pill variant="mute" className="font-mono tabular-nums">
          x{zoomFactor}
        </Pill>
      </div>

      <div
        ref={trackRef}
        className="relative h-[150px] mx-2.5 mt-1.5 mb-0.5 select-none"
      >
        <canvas
          ref={canvasRef}
          aria-label="Onda ampliada de la línea"
          className="block w-full h-full rounded-lg"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 rounded-lg bg-[rgba(181,58,34,0.14)]"
          style={{
            left: `${startPercent}%`,
            width: `${Math.max(1, endPercent - startPercent)}%`,
          }}
        />

        <div
          role="slider"
          tabIndex={0}
          aria-label="Inicio de la línea"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, lineEndMs - MIN_LINE_DURATION_MS)}
          aria-valuenow={lineStartMs}
          aria-valuetext={formatTime(lineStartMs)}
          onKeyDown={handleKeyDown('start')}
          {...startDrag.handlers}
          style={{
            left: `calc(${startPercent}% - 12px)`,
            touchAction: 'none',
          }}
          className={`absolute -top-1.5 -bottom-1.5 w-6 rounded-[12px] bg-bg shadow-[var(--shadow-boton)] grid place-items-center cursor-ew-resize touch-none ${
            startDrag.isDragging ? 'ring-2 ring-acc' : ''
          } ${FOCUS_RING}`.trim()}
        >
          <span className="w-[3px] h-7 rounded-full bg-acc" aria-hidden="true" />
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Fin de la línea"
          aria-valuemin={Math.min(durationMs, lineStartMs + MIN_LINE_DURATION_MS)}
          aria-valuemax={Math.max(0, durationMs)}
          aria-valuenow={lineEndMs}
          aria-valuetext={formatTime(lineEndMs)}
          onKeyDown={handleKeyDown('end')}
          {...endDrag.handlers}
          style={{
            left: `calc(${endPercent}% - 12px)`,
            touchAction: 'none',
          }}
          className={`absolute -top-1.5 -bottom-1.5 w-6 rounded-[12px] bg-bg shadow-[var(--shadow-boton)] grid place-items-center cursor-ew-resize touch-none ${
            endDrag.isDragging ? 'ring-2 ring-acc' : ''
          } ${FOCUS_RING}`.trim()}
        >
          <span className="w-[3px] h-7 rounded-full bg-acc" aria-hidden="true" />
        </div>
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] font-bold text-acc tabular-nums">
        <span>▲ {formatTime(lineStartMs)}</span>
        <span>{formatTime(lineEndMs)} ▲</span>
      </div>
    </WellPanel>
  );
}
