import { useEffect, useRef, useState } from 'react';
import { formatDisplayTime, formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import {
  Icon,
  IconButton,
  Pill,
  RaisedButton,
  Segmented,
  SyncButton,
  WellPanel,
} from '@/ui';
import { NoAudioCard } from './NoAudioCard';
import { getNextPlaybackRate } from './syncViewHelpers';
import { WaveformStrip } from './WaveformStrip';

export type SyncSegmentedMode = 'line' | 'word' | 'burst';

export interface LineSyncScreenProps {
  hasAudio: boolean;
  peaks: readonly number[];
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  lines: readonly LyricLine[];
  activeLineIndex: number;
  canUndo: boolean;
  syncMode: SyncSegmentedMode;
  burstWindow?: { windowStartMs: number; windowEndMs: number } | null;
  onSelectMode: (mode: SyncSegmentedMode) => void;
  onSeek: (targetMs: number) => void;
  onTogglePlay: () => void;
  onChangePlaybackRate: (rate: number) => void;
  onUndo: () => void;
  onSelectLine: (index: number) => void;
  onStampLine: (nowMs: number) => void;
  onOpenLoupe: () => void;
  onStopBurst: () => void;
  onUploadAudio: (file: File) => Promise<void>;
  onUseDemo: () => Promise<void>;
}

const MODE_OPTIONS: readonly { value: SyncSegmentedMode; label: string }[] = [
  { value: 'line', label: 'Línea' },
  { value: 'word', label: 'Palabra' },
  { value: 'burst', label: 'Ráfaga' },
];

/**
 * Pantalla móvil de sincronización por línea y modo ráfaga de línea aislada.
 */
export function LineSyncScreen({
  hasAudio,
  peaks,
  currentTimeMs,
  durationMs,
  isPlaying,
  playbackRate,
  lines,
  activeLineIndex,
  canUndo,
  syncMode,
  burstWindow = null,
  onSelectMode,
  onSeek,
  onTogglePlay,
  onChangePlaybackRate,
  onUndo,
  onSelectLine,
  onStampLine,
  onOpenLoupe,
  onStopBurst,
  onUploadAudio,
  onUseDemo,
}: LineSyncScreenProps) {
  const [liveNotice, setLiveNotice] = useState('');
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = activeLineRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') {
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [activeLineIndex]);

  if (!hasAudio) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <Segmented
          options={MODE_OPTIONS}
          value={syncMode}
          onChange={onSelectMode}
          aria-label="Modo de sincronización"
        />
        <NoAudioCard onUploadAudio={onUploadAudio} onUseDemo={onUseDemo} />
      </div>
    );
  }

  const activeLine = lines[activeLineIndex];
  const hasLines = lines.length > 0;
  const lineNumber = Math.min(lines.length, activeLineIndex + 1);

  const handleStampPointerDown = () => {
    if (!hasLines) {
      return;
    }
    const stampMs = currentTimeMs;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
    onStampLine(stampMs);
    setLiveNotice(`Línea ${lineNumber} marcada en ${formatTime(stampMs)}`);
  };

  return (
    <section
      aria-label="Sincronizar por línea"
      className="flex-1 min-h-0 flex flex-col gap-3"
    >
      <Segmented
        options={MODE_OPTIONS}
        value={syncMode}
        onChange={onSelectMode}
        aria-label="Modo de sincronización"
      />

      <WaveformStrip
        peaks={peaks}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        lines={lines}
        onSeek={onSeek}
        onOpenLoupe={onOpenLoupe}
        canOpenLoupe={Boolean(activeLine)}
      />

      {syncMode === 'burst' && burstWindow ? (
        <div className="flex items-center justify-between gap-2 px-1">
          <Pill variant="acc">
            <span>
              Ráfaga en bucle · {formatDisplayTime(burstWindow.windowStartMs)} –{' '}
              {formatDisplayTime(burstWindow.windowEndMs)}
            </span>
          </Pill>
          <RaisedButton
            size="sm"
            onClick={onStopBurst}
            className="min-h-12 px-3 text-xs font-extrabold"
          >
            Detener ráfaga
          </RaisedButton>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-0.5">
        <IconButton
          aria-label={`Velocidad ${playbackRate}x`}
          onClick={() => onChangePlaybackRate(getNextPlaybackRate(playbackRate))}
          className="font-mono text-sm font-extrabold"
        >
          <span>{`${playbackRate}×`}</span>
        </IconButton>

        <IconButton
          round
          aria-label="Retroceder 5 segundos"
          onClick={() => onSeek(Math.max(0, currentTimeMs - 5000))}
        >
          <Icon name="rewind" size={20} />
        </IconButton>

        <IconButton
          round
          size="xl"
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          onClick={onTogglePlay}
          className="text-acc"
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={26} />
        </IconButton>

        <IconButton
          round
          aria-label="Adelantar 5 segundos"
          onClick={() => onSeek(Math.min(durationMs, currentTimeMs + 5000))}
        >
          <Icon name="forward" size={20} />
        </IconButton>

        <IconButton
          aria-label="Deshacer última marca"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Icon name="undo" size={20} />
        </IconButton>
      </div>

      <WellPanel className="flex-1 min-h-0 p-2 overflow-y-auto flex flex-col gap-1.5">
        {hasLines ? (
          lines.map((line, index) => {
            const isCurrent = index === activeLineIndex;
            const isSynced = line.startMs !== null;
            return (
              <button
                key={line.id}
                ref={isCurrent ? activeLineRef : null}
                type="button"
                onClick={() => onSelectLine(index)}
                aria-current={isCurrent ? 'true' : undefined}
                className={`w-full min-h-12 px-3.5 py-2.5 rounded-[14px] flex items-center justify-between gap-2.5 text-left transition-shadow motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                  isCurrent
                    ? 'relieve text-ink font-extrabold'
                    : isSynced
                      ? 'bg-transparent text-ink font-semibold'
                      : 'bg-transparent text-mute font-semibold'
                }`}
              >
                <span className="truncate text-[14.5px] flex-1 min-w-0">
                  {line.text}
                </span>
                <span
                  className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                    isCurrent
                      ? 'text-acc'
                      : isSynced
                        ? 'text-ok'
                        : 'text-mute/75'
                  }`}
                >
                  {isCurrent && !isSynced
                    ? 'esperando marca'
                    : formatDisplayTime(line.startMs)}
                </span>
              </button>
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center p-4 text-center text-sm font-semibold text-mute">
            Aún no hay letra cargada. Agrega líneas en la pestaña Letra.
          </div>
        )}
      </WellPanel>

      <SyncButton
        title={hasLines ? `MARCAR LÍNEA ${lineNumber}` : 'SIN LETRA PARA MARCAR'}
        hint={
          hasLines
            ? 'Toca justo al empezar a cantarla'
            : 'Ve a Letra para pegar o cargar la canción'
        }
        disabled={!hasLines}
        onPointerDown={handleStampPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
      />

      <div aria-live="polite" className="sr-only">
        {liveNotice}
      </div>
    </section>
  );
}
