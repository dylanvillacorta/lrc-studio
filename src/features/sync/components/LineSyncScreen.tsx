import { memo, useEffect, useRef, useState } from 'react';
import type { PlaybackTimeStore } from '@/features/sync/hooks/playbackTimeStore';
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
import {
  getNextPlaybackRate,
  SYNC_MODE_OPTIONS,
  SYNC_SEGMENTED_CLASS,
  type SyncSegmentedMode,
} from './syncViewHelpers';
import { WaveformStrip } from './WaveformStrip';

export type { SyncSegmentedMode };

export interface LineSyncScreenProps {
  hasAudio: boolean;
  peaks: readonly number[];
  timeStore?: PlaybackTimeStore | null;
  getCurrentTimeMs?: () => number;
  currentTimeMs?: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  lines: readonly LyricLine[];
  activeLineIndex: number;
  playingLineIndex?: number;
  trackedListIndex?: number;
  canUndo: boolean;
  syncMode: SyncSegmentedMode;
  burstWindow?: { windowStartMs: number; windowEndMs: number } | null;
  onSelectMode: (mode: SyncSegmentedMode) => void;
  onSeek: (targetMs: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onTogglePlay: () => void;
  onChangePlaybackRate: (rate: number) => void;
  onUndo: () => void;
  onSelectLine: (index: number) => void;
  onStampLine: (nowMs: number) => void;
  onOpenLoupe: () => void;
  onStopBurst: () => void;
  onUploadAudio: (file: File) => Promise<void>;
}

/**
 * Pantalla móvil de sincronización por línea y modo ráfaga de línea aislada.
 */
export const LineSyncScreen = memo(function LineSyncScreen({
  hasAudio,
  peaks,
  timeStore = null,
  getCurrentTimeMs,
  currentTimeMs = 0,
  durationMs,
  isPlaying,
  playbackRate,
  lines,
  activeLineIndex,
  playingLineIndex = -1,
  trackedListIndex = activeLineIndex,
  canUndo,
  syncMode,
  burstWindow = null,
  onSelectMode,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onTogglePlay,
  onChangePlaybackRate,
  onUndo,
  onSelectLine,
  onStampLine,
  onOpenLoupe,
  onStopBurst,
  onUploadAudio,
}: LineSyncScreenProps) {
  const [liveNotice, setLiveNotice] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const lineButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const listEl = listRef.current;
    const targetEl = lineButtonRefs.current[trackedListIndex];
    if (!listEl || !targetEl) {
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const targetTop = Math.max(
      0,
      targetEl.offsetTop - (listEl.clientHeight - targetEl.offsetHeight) / 2,
    );
    if (typeof listEl.scrollTo === 'function') {
      listEl.scrollTo({
        top: targetTop,
        behavior: reduced ? 'auto' : 'smooth',
      });
    } else {
      listEl.scrollTop = targetTop;
    }
  }, [trackedListIndex]);

  if (!hasAudio) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <Segmented
          options={SYNC_MODE_OPTIONS}
          value={syncMode}
          onChange={onSelectMode}
          aria-label="Modo de sincronización"
          className={SYNC_SEGMENTED_CLASS}
        />
        <NoAudioCard onUploadAudio={onUploadAudio} />
      </div>
    );
  }

  const activeLine = lines[activeLineIndex];
  const hasLines = lines.length > 0;
  const lineNumber = Math.min(lines.length, activeLineIndex + 1);

  const readCurrentTimeMs = () =>
    getCurrentTimeMs ? getCurrentTimeMs() : timeStore ? timeStore.getTimeMs() : currentTimeMs;

  const handleStampPointerDown = () => {
    if (!hasLines) {
      return;
    }
    const stampMs = readCurrentTimeMs();
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
    onStampLine(stampMs);
    setLiveNotice(`Línea ${lineNumber} marcada en ${formatTime(stampMs)}`);
  };

  return (
    <section
      aria-label="Sincronizar por línea"
      className="flex-1 min-h-0 flex flex-col gap-1.5 [@media(max-height:720px)]:gap-1"
    >
      <Segmented
        options={SYNC_MODE_OPTIONS}
        value={syncMode}
        onChange={onSelectMode}
        aria-label="Modo de sincronización"
        className={SYNC_SEGMENTED_CLASS}
      />

      <WaveformStrip
        peaks={peaks}
        timeStore={timeStore}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        lines={lines}
        compact
        onSeek={onSeek}
        onSeekStart={onSeekStart}
        onSeekEnd={onSeekEnd}
        onOpenLoupe={onOpenLoupe}
        canOpenLoupe={Boolean(activeLine)}
      />

      {syncMode === 'burst' && burstWindow ? (
        <div className="flex items-center justify-between gap-2 px-1 flex-none">
          <Pill variant="acc">
            <span>
              Ráfaga en bucle · {formatDisplayTime(burstWindow.windowStartMs)} –{' '}
              {formatDisplayTime(burstWindow.windowEndMs)}
            </span>
          </Pill>
          <RaisedButton
            size="sm"
            onClick={onStopBurst}
            className="min-h-11 px-3 text-xs font-extrabold"
          >
            Detener ráfaga
          </RaisedButton>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-0.5 flex-none">
        <IconButton
          aria-label={`Velocidad ${playbackRate}x`}
          onClick={() => onChangePlaybackRate(getNextPlaybackRate(playbackRate))}
          className="font-mono text-xs font-extrabold min-h-11 min-w-11 [@media(max-height:720px)]:min-h-10 [@media(max-height:720px)]:min-w-10"
        >
          <span>{`${playbackRate}×`}</span>
        </IconButton>

        <IconButton
          round
          aria-label="Retroceder 5 segundos"
          onClick={() => onSeek(Math.max(0, readCurrentTimeMs() - 5000))}
          className="min-h-11 min-w-11 [@media(max-height:720px)]:min-h-10 [@media(max-height:720px)]:min-w-10"
        >
          <Icon name="rewind" size={18} />
        </IconButton>

        <IconButton
          round
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          onClick={onTogglePlay}
          className="text-acc min-h-12 min-w-12 [@media(max-height:720px)]:min-h-11 [@media(max-height:720px)]:min-w-11"
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={22} />
        </IconButton>

        <IconButton
          round
          aria-label="Adelantar 5 segundos"
          onClick={() => onSeek(Math.min(durationMs, readCurrentTimeMs() + 5000))}
          className="min-h-11 min-w-11 [@media(max-height:720px)]:min-h-10 [@media(max-height:720px)]:min-w-10"
        >
          <Icon name="forward" size={18} />
        </IconButton>

        <IconButton
          aria-label="Deshacer última marca"
          disabled={!canUndo}
          onClick={onUndo}
          className="min-h-11 min-w-11 [@media(max-height:720px)]:min-h-10 [@media(max-height:720px)]:min-w-10"
        >
          <Icon name="undo" size={18} />
        </IconButton>
      </div>

      <WellPanel
        ref={listRef}
        data-testid="sync-line-list"
        className="flex-1 min-h-0 p-1.5 overflow-y-auto flex flex-col gap-1"
      >
        {hasLines ? (
          lines.map((line, index) => {
            const isCurrent = index === activeLineIndex;
            const isPlayingLine = index === playingLineIndex;
            const isSynced = line.startMs !== null;
            return (
              <button
                key={line.id}
                ref={(el) => {
                  lineButtonRefs.current[index] = el;
                }}
                type="button"
                onClick={() => onSelectLine(index)}
                aria-current={isCurrent ? 'true' : undefined}
                data-playing={isPlayingLine ? 'true' : undefined}
                className={`w-full min-h-11 px-3 py-1.5 rounded-[12px] flex items-center justify-between gap-2 text-left transition-shadow motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                  isCurrent
                    ? isPlayingLine
                      ? 'relieve ring-1 ring-acc/45 text-ink font-extrabold'
                      : 'relieve text-ink font-extrabold'
                    : isPlayingLine
                      ? 'bg-acc/10 ring-1 ring-acc/35 text-ink font-bold'
                      : isSynced
                        ? 'bg-transparent text-ink font-semibold'
                        : 'bg-transparent text-mute font-semibold'
                }`}
              >
                <span className="truncate text-[14px] flex-1 min-w-0">
                  {line.text}
                </span>
                <span
                  aria-label={!isSynced ? 'Sin marca de tiempo' : undefined}
                  className={`font-mono text-xs font-bold tabular-nums shrink-0 w-[8ch] text-right ${
                    !isSynced
                      ? 'text-acc/70'
                      : isCurrent || isPlayingLine
                        ? 'text-acc'
                        : 'text-ok'
                  }`}
                >
                  {formatDisplayTime(line.startMs)}
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
        className="min-h-[84px] rounded-[28px] [@media(max-height:720px)]:min-h-[68px] [@media(max-height:720px)]:rounded-[24px]"
        style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
      />

      <div aria-live="polite" className="sr-only">
        {liveNotice}
      </div>
    </section>
  );
});
