import type { PointerEvent } from 'react';
import { formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { Icon, RaisedButton, WellPanel } from '@/ui';
import { downsampleWaveformBars } from './syncViewHelpers';

export interface WaveformStripProps {
  peaks: readonly number[];
  currentTimeMs: number;
  durationMs: number;
  lines?: readonly LyricLine[];
  compact?: boolean;
  statusText?: string;
  onSeek: (targetMs: number) => void;
  onOpenLoupe?: () => void;
  canOpenLoupe?: boolean;
}

/**
 * Franja de forma de onda con picos, cabezal, marcas de línea, búsqueda táctil y acceso a Lupa.
 */
export function WaveformStrip({
  peaks,
  currentTimeMs,
  durationMs,
  lines = [],
  compact = false,
  statusText,
  onSeek,
  onOpenLoupe,
  canOpenLoupe = true,
}: WaveformStripProps) {
  const bars = downsampleWaveformBars(peaks, 48);
  const progressPct =
    durationMs > 0
      ? Math.max(0, Math.min(100, (currentTimeMs / durationMs) * 100))
      : 0;
  const remainingMs = Math.max(0, durationMs - currentTimeMs);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (durationMs <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onSeek(Math.round(ratio * durationMs));
  };

  const viewWidth = 304;
  const stepX = viewWidth / bars.length;

  return (
    <WellPanel className={compact ? 'p-2.5 flex flex-col gap-1.5' : 'p-3 flex flex-col gap-2'}>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Posición en la forma de onda"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(durationMs))}
        aria-valuenow={Math.round(currentTimeMs)}
        onPointerDown={handlePointerDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onSeek(Math.max(0, currentTimeMs - 1000));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            onSeek(Math.min(durationMs, currentTimeMs + 1000));
          }
        }}
        className={`relative w-full overflow-hidden rounded-[12px] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
          compact ? 'h-[44px]' : 'h-[76px]'
        }`}
        style={{ touchAction: 'manipulation' }}
      >
        {/* Onda base */}
        <svg
          viewBox={`0 0 ${viewWidth} 100`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="w-full h-full block"
        >
          {bars.map((amp, i) => {
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
          })}
        </svg>

        {/* Onda reproducida */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
          style={{ width: `${progressPct}%` }}
        >
          <svg
            viewBox={`0 0 ${viewWidth} 100`}
            preserveAspectRatio="none"
            className="h-full block"
            style={{ width: progressPct > 0 ? `${(100 / progressPct) * 100}%` : '100%' }}
          >
            {bars.map((amp, i) => {
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
            })}
          </svg>
        </div>

        {/* Marcas de líneas sincronizadas */}
        {durationMs > 0
          ? lines.map((line) => {
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
            })
          : null}

        {/* Cabezal */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-[3px] -ml-[1.5px] bg-acc rounded-full pointer-events-none"
          style={{ left: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs font-bold text-mute font-mono tabular-nums">
        <span>{formatTime(currentTimeMs)}</span>
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-sans text-[11px] font-bold">
            {statusText ?? `-${formatTime(remainingMs)}`}
          </span>
          {onOpenLoupe ? (
            <RaisedButton
              size="sm"
              onClick={onOpenLoupe}
              disabled={!canOpenLoupe}
              aria-label="Abrir ajuste fino en lupa"
              className="min-h-12 px-3 text-xs font-extrabold text-acc"
            >
              <Icon name="search" size={16} />
              <span>Lupa</span>
            </RaisedButton>
          ) : null}
        </div>
      </div>
    </WellPanel>
  );
}
