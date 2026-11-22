import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import {
  usePlaybackTime,
  type PlaybackTimeStore,
} from '@/features/sync/hooks/playbackTimeStore';
import {
  computeFloatingIndicatorLeftPct,
  computeFramedPointerTimeMs,
  isTapGesture,
  reduceTimelineInteraction,
  shouldThrottleSeek,
  TIMELINE_COLLAPSE_DELAY_MS,
  type TimelineFrame,
  type TimelineInteractionState,
} from '@/features/sync/model/timelineScrub';
import { formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { Icon, RaisedButton, WellPanel } from '@/ui';
import { downsampleWaveformBars } from './syncViewHelpers';

export interface WaveformStripProps {
  peaks: readonly number[];
  timeStore?: PlaybackTimeStore | null;
  currentTimeMs?: number;
  durationMs: number;
  lines?: readonly LyricLine[];
  compact?: boolean;
  statusText?: string;
  /** Permite forzar el estado expandido (útil en pruebas o escritorio). */
  forceExpanded?: boolean;
  /** Retardo en ms para compactar tras soltar la barra. */
  collapseDelayMs?: number;
  onSeek: (targetMs: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onOpenLoupe?: () => void;
  canOpenLoupe?: boolean;
}

const VIEW_WIDTH = 304;

/**
 * Franja de forma de onda compacta por defecto que se expande en superposición al tocar o arrastrar,
 * con arrastre real por puntero (`setPointerCapture` + `touch-action: none`) e indicador flotante.
 */
export const WaveformStrip = memo(function WaveformStrip({
  peaks,
  timeStore = null,
  currentTimeMs = 0,
  durationMs,
  lines = [],
  compact = false,
  statusText,
  forceExpanded = false,
  collapseDelayMs = TIMELINE_COLLAPSE_DELAY_MS,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onOpenLoupe,
  canOpenLoupe = true,
}: WaveformStripProps) {
  const effectiveTimeMs = usePlaybackTime(timeStore, currentTimeMs, 33);
  const [interaction, setInteraction] = useState<TimelineInteractionState>({
    expanded: forceExpanded,
    dragging: false,
  });
  const [dragTimeMs, setDragTimeMs] = useState<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekAtRef = useRef<number>(0);
  // Geometría y X inicial congeladas en pointerdown: la expansión visual no debe alterar el cálculo.
  const dragFrameRef = useRef<TimelineFrame | null>(null);
  const downXRef = useRef<number>(0);

  const isExpanded = forceExpanded || interaction.expanded;
  const displayTimeMs = dragTimeMs !== null ? dragTimeMs : effectiveTimeMs;

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const scheduleCollapse = useCallback(() => {
    clearCollapseTimer();
    if (forceExpanded) {
      return;
    }
    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null;
      setInteraction((prev) => reduceTimelineInteraction(prev, 'timeout'));
    }, collapseDelayMs);
  }, [clearCollapseTimer, collapseDelayMs, forceExpanded]);

  useEffect(() => {
    return () => {
      clearCollapseTimer();
    };
  }, [clearCollapseTimer]);

  const bars = useMemo(() => downsampleWaveformBars(peaks, 48), [peaks]);
  const stepX = VIEW_WIDTH / bars.length;

  const baseBarLines = useMemo(
    () =>
      bars.map((amp, i) => {
        const x = i * stepX + stepX * 0.5;
        const halfH = Math.max(6, amp * 46);
        return (
          <line
            key={i}
            x1={x}
            y1={50 - halfH}
            x2={x}
            y2={50 + halfH}
            stroke="var(--color-mute)"
            strokeOpacity={0.35}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        );
      }),
    [bars, stepX],
  );

  const playedBarLines = useMemo(
    () =>
      bars.map((amp, i) => {
        const x = i * stepX + stepX * 0.5;
        const halfH = Math.max(6, amp * 46);
        return (
          <line
            key={i}
            x1={x}
            y1={50 - halfH}
            x2={x}
            y2={50 + halfH}
            stroke="var(--color-ink)"
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        );
      }),
    [bars, stepX],
  );

  const lineMarkers = useMemo(() => {
    if (durationMs <= 0) {
      return null;
    }
    return lines.map((line) => {
      if (line.startMs === null) {
        return null;
      }
      const leftPct = Math.max(0, Math.min(100, (line.startMs / durationMs) * 100));
      return (
        <span
          key={line.id}
          aria-hidden="true"
          className="absolute inset-y-1 w-[2px] bg-ok/70 rounded-full pointer-events-none"
          style={{ left: `${leftPct}%` }}
        />
      );
    });
  }, [durationMs, lines]);

  const progressPct =
    durationMs > 0
      ? Math.max(0, Math.min(100, (displayTimeMs / durationMs) * 100))
      : 0;
  const floatingLeftPct = computeFloatingIndicatorLeftPct(progressPct);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (durationMs <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    clearCollapseTimer();
    dragFrameRef.current = { left: rect.left, width: rect.width };
    downXRef.current = event.clientX;
    activePointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignorar si el entorno sintético no soporta setPointerCapture.
    }

    setInteraction((prev) => reduceTimelineInteraction(prev, 'pointerdown'));
    onSeekStart?.();

    const targetMs = computeFramedPointerTimeMs(event.clientX, dragFrameRef.current, durationMs);
    setDragTimeMs(targetMs);
    lastSeekAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
    onSeek(targetMs);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!interaction.dragging || activePointerIdRef.current !== event.pointerId) {
      return;
    }
    const frame = dragFrameRef.current;
    if (!frame || frame.width <= 0 || durationMs <= 0) {
      return;
    }
    // Un movimiento menor al umbral sigue siendo un toque: sin seeks intermedios.
    if (isTapGesture(downXRef.current, event.clientX)) {
      return;
    }
    const targetMs = computeFramedPointerTimeMs(event.clientX, frame, durationMs);
    setDragTimeMs(targetMs);

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (shouldThrottleSeek(now, lastSeekAtRef.current)) {
      lastSeekAtRef.current = now;
      onSeek(targetMs);
    }
  };

  const finishDrag = (
    event: PointerEvent<HTMLDivElement>,
    kind: 'pointerup' | 'pointercancel',
  ) => {
    if (!interaction.dragging || activePointerIdRef.current !== event.pointerId) {
      return;
    }
    activePointerIdRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignorar en entornos sin captura activa.
    }

    const frame = dragFrameRef.current;
    dragFrameRef.current = null;
    const fallbackMs = timeStore ? timeStore.getTimeMs() : currentTimeMs;
    const isTap = kind === 'pointerup' && isTapGesture(downXRef.current, event.clientX);

    setDragTimeMs(null);
    if (!isTap) {
      const finalMs =
        kind === 'pointerup' && frame && frame.width > 0 && durationMs > 0
          ? computeFramedPointerTimeMs(event.clientX, frame, durationMs)
          : (dragTimeMs ?? fallbackMs);
      onSeek(finalMs);
    }
    onSeekEnd?.();
    setInteraction((prev) => reduceTimelineInteraction(prev, kind));
    scheduleCollapse();
  };

  const loupeButton = onOpenLoupe ? (
    <RaisedButton
      size="sm"
      onClick={onOpenLoupe}
      disabled={!canOpenLoupe}
      aria-label="Abrir ajuste fino en lupa"
      className="min-h-11 min-w-11 px-2.5 text-xs font-extrabold text-acc shrink-0"
    >
      <Icon name="search" size={16} />
      <span className="hidden sm:inline">Lupa</span>
    </RaisedButton>
  ) : null;

  return (
    <div
      className={`relative z-20 flex-none ${
        compact ? 'h-[52px] [@media(max-height:720px)]:h-[48px]' : 'h-[56px] [@media(max-height:720px)]:h-[50px]'
      }`}
    >
      <WellPanel
        data-timeline-expanded={isExpanded ? 'true' : 'false'}
        className={
          isExpanded
            ? 'absolute inset-x-0 top-0 z-30 px-2.5 py-3 bg-bg shadow-[var(--shadow-raised-xl)] flex flex-col gap-2 transition-shadow duration-150 motion-reduce:transition-none'
            : 'h-full px-2.5 py-1 flex flex-col justify-center transition-shadow duration-150 motion-reduce:transition-none'
        }
      >
        {isExpanded ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                data-testid="timeline-expanded-time"
                className="font-mono text-xl font-extrabold text-acc tabular-nums"
              >
                {formatTime(displayTimeMs)}
              </span>
              <span className="font-mono text-xs font-bold text-mute tabular-nums shrink-0">
                / {formatTime(durationMs)}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {statusText ? (
                <span className="truncate max-w-[110px] font-sans text-[11px] font-bold text-mute">
                  {statusText}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Fila de la barra: misma geometría horizontal compacta y expandida (solo crece en vertical). */}
        <div className="flex items-center gap-2 min-w-0">
        <span
          data-testid="timeline-compact-time"
          className="font-mono text-xs font-bold text-ink tabular-nums shrink-0"
        >
          {formatTime(displayTimeMs)}
        </span>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Posición en la forma de onda"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.round(durationMs))}
          aria-valuenow={Math.round(displayTimeMs)}
          data-expanded={isExpanded ? 'true' : 'false'}
          data-dragging={interaction.dragging ? 'true' : 'false'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => finishDrag(e, 'pointerup')}
          onPointerCancel={(e) => finishDrag(e, 'pointercancel')}
          onKeyDown={(e) => {
            const nowMs = timeStore ? timeStore.getTimeMs() : currentTimeMs;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onSeek(Math.max(0, nowMs - 1000));
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              onSeek(Math.min(durationMs, nowMs + 1000));
            }
          }}
          className={`relative cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc rounded-[12px] ${
            isExpanded
              ? 'flex-1 min-w-0 h-[80px] overflow-visible mt-5'
              : 'flex-1 min-w-0 h-[38px] [@media(max-height:720px)]:h-[34px] overflow-hidden'
          }`}
          style={{ touchAction: 'none' }}
        >
          {/* Indicador flotante bajo el dedo cuando está expandida */}
          {isExpanded ? (
            <span
              aria-hidden="true"
              data-testid="timeline-floating-indicator"
              className="pointer-events-none absolute -top-6 -translate-x-1/2 px-2 py-0.5 rounded-full bg-ink text-bg font-mono text-[11px] font-extrabold tabular-nums shadow-sm whitespace-nowrap z-10"
              style={{ left: `${floatingLeftPct}%` }}
            >
              {formatTime(displayTimeMs)}
            </span>
          ) : null}

          <div className="relative w-full h-full overflow-hidden rounded-[12px]">
            {/* Onda base */}
            <svg
              viewBox={`0 0 ${VIEW_WIDTH} 100`}
              preserveAspectRatio="none"
              aria-hidden="true"
              className="w-full h-full block"
            >
              {baseBarLines}
            </svg>

            {/* Onda reproducida */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
              style={{ width: `${progressPct}%` }}
            >
              <svg
                viewBox={`0 0 ${VIEW_WIDTH} 100`}
                preserveAspectRatio="none"
                className="h-full block"
                style={{ width: progressPct > 0 ? `${(100 / progressPct) * 100}%` : '100%' }}
              >
                {playedBarLines}
              </svg>
            </div>

            {/* Marcas de líneas sincronizadas */}
            {lineMarkers}

            {/* Cabezal / Aguja */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 w-[3px] -ml-[1.5px] bg-acc rounded-full pointer-events-none"
              style={{ left: `${progressPct}%` }}
            >
              <span
                className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-acc shadow-sm ${
                  isExpanded ? 'top-1 w-3.5 h-3.5' : 'top-0.5 w-2.5 h-2.5'
                }`}
              />
            </span>
          </div>
        </div>

        <span className="font-mono text-xs font-bold text-mute tabular-nums shrink-0">
          {formatTime(durationMs)}
        </span>
        {loupeButton}
        </div>
      </WellPanel>
    </div>
  );
});
