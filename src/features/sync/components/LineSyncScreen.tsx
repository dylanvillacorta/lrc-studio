import { memo, useRef, useState } from 'react';
import {
  computeCompensatedStampMs,
  readCurrentTimeMs,
} from '@/features/sync';
import type { PlaybackTimeStore } from '@/features/sync/hooks/playbackTimeStore';
import { useCenteredListScroll } from '@/features/sync/hooks/useCenteredListScroll';
import { formatDisplayTime, formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import {
  Icon,
  IconButton,
  Segmented,
  SyncButton,
  WellPanel,
} from '@/ui';
import { LineRowActionBar } from './LineRowActions';
import { NoAudioCard } from './NoAudioCard';
import {
  SYNC_MODE_OPTIONS,
  SYNC_SEGMENTED_CLASS,
  type SyncSegmentedMode,
} from './syncViewHelpers';
import { TransportBar } from './TransportBar';
import { WaveformStrip } from './WaveformStrip';

export type { SyncSegmentedMode };

/**
 * Devuelve el índice de la última línea con marca de tiempo (`startMs !== null`), o `-1` si no hay ninguna.
 */
export function findLastMarkedLineIndex(lines: readonly LyricLine[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i]?.startMs !== null) {
      return i;
    }
  }
  return -1;
}

export interface LineSyncScreenProps {
  hasAudio: boolean;
  peaks: readonly number[];
  timeStore?: PlaybackTimeStore | null;
  getCurrentTimeMs?: () => number;
  currentTimeMs?: number;
  latencyMs?: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  lines: readonly LyricLine[];
  activeLineIndex: number;
  playingLineIndex?: number;
  trackedListIndex?: number;
  syncMode: SyncSegmentedMode;
  onSelectMode: (mode: SyncSegmentedMode) => void;
  onSeek: (targetMs: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onTogglePlay: () => void;
  onChangePlaybackRate: (rate: number) => void;
  onSelectLine: (index: number) => void;
  onPlayFromLine?: (index: number) => void;
  onClearLineMark?: (index: number) => void;
  onStampLine: (nowMs: number) => void;
  onUploadAudio: (file: File) => Promise<void>;
}

/**
 * Pantalla móvil de sincronización por línea.
 */
export const LineSyncScreen = memo(function LineSyncScreen({
  hasAudio,
  peaks,
  timeStore = null,
  getCurrentTimeMs,
  currentTimeMs = 0,
  latencyMs = 0,
  durationMs,
  isPlaying,
  playbackRate,
  lines,
  activeLineIndex,
  playingLineIndex = -1,
  trackedListIndex = activeLineIndex,
  syncMode,
  onSelectMode,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onTogglePlay,
  onChangePlaybackRate,
  onSelectLine,
  onPlayFromLine,
  onClearLineMark,
  onStampLine,
  onUploadAudio,
}: LineSyncScreenProps) {
  const [liveNotice, setLiveNotice] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const lineRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useCenteredListScroll({
    containerRef: listRef,
    itemRefs: lineRowRefs,
    targetIndex: trackedListIndex,
    enabled: hasAudio && lines.length > 0,
    itemCount: lines.length,
  });

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

  const hasLines = lines.length > 0;
  const lineNumber = Math.min(lines.length, activeLineIndex + 1);
  const lastMarkedLineIndex = findLastMarkedLineIndex(lines);
  const hasAnyMarkedLine = lastMarkedLineIndex >= 0;

  const readNowMs = () =>
    readCurrentTimeMs({ getCurrentTimeMs, timeStore, currentTimeMs });

  const handleStampPointerDown = () => {
    if (!hasLines) {
      return;
    }
    const stampMs = computeCompensatedStampMs(readNowMs(), latencyMs);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
    onStampLine(stampMs);
    setLiveNotice(`Línea ${lineNumber} marcada en ${formatTime(stampMs)}`);
  };

  const handleUndoLastLineMark = () => {
    if (lastMarkedLineIndex < 0 || !onClearLineMark) {
      return;
    }
    onClearLineMark(lastMarkedLineIndex);
    setLiveNotice(`Marca de línea ${lastMarkedLineIndex + 1} borrada`);
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
      />

      <TransportBar
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        durationMs={durationMs}
        readNowMs={readNowMs}
        onSeek={onSeek}
        onTogglePlay={onTogglePlay}
        onChangePlaybackRate={onChangePlaybackRate}
      />

      <WellPanel
        ref={listRef}
        data-testid="sync-line-list"
        className="flex-1 min-h-0 p-1.5 overflow-y-auto overscroll-contain flex flex-col gap-1"
      >
        {hasLines ? (
          lines.map((line, index) => {
            const isCurrent = index === activeLineIndex;
            const isPlayingLine = index === playingLineIndex;
            const isSynced = line.startMs !== null;
            return (
              <div
                key={line.id}
                ref={(el) => {
                  lineRowRefs.current[index] = el;
                }}
                data-line-index={index}
                data-playing={isPlayingLine ? 'true' : undefined}
                className={`w-full min-h-11 rounded-[12px] flex items-center gap-1 transition-shadow motion-reduce:transition-none ${
                  isCurrent
                    ? isPlayingLine
                      ? 'relieve ring-1 ring-acc/45 text-ink'
                      : 'relieve text-ink'
                    : isPlayingLine
                      ? 'bg-acc/10 ring-1 ring-acc/35 text-ink'
                      : 'bg-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectLine(index)}
                  aria-current={isCurrent ? 'true' : undefined}
                  data-playing={isPlayingLine ? 'true' : undefined}
                  className={`flex-1 min-w-0 min-h-11 px-3 py-1.5 rounded-[12px] flex items-center justify-between gap-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                    isCurrent
                      ? 'text-ink font-extrabold'
                      : isPlayingLine
                        ? 'text-ink font-bold'
                        : isSynced
                          ? 'text-ink font-semibold'
                          : 'text-mute font-semibold'
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
                {isCurrent ? (
                  <div className="pr-1 shrink-0">
                    <LineRowActionBar
                      isSynced={isSynced}
                      onPlayFromHere={
                        isSynced && onPlayFromLine
                          ? () => onPlayFromLine(index)
                          : undefined
                      }
                      onClearMark={
                        isSynced && onClearLineMark
                          ? () => {
                              onClearLineMark(index);
                              setLiveNotice(`Marca de línea ${index + 1} borrada`);
                            }
                          : undefined
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center p-4 text-center text-sm font-semibold text-mute">
            Aún no hay letra cargada. Agrega líneas en la pestaña Letra.
          </div>
        )}
      </WellPanel>

      <div className="flex items-center gap-2 flex-none">
        <IconButton
          aria-label="Deshacer última marca de línea"
          disabled={!hasAnyMarkedLine}
          onClick={handleUndoLastLineMark}
          className="min-h-11 min-w-11 shrink-0"
        >
          <Icon name="undo" size={18} />
        </IconButton>

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
          className="flex-1 min-w-0 w-auto min-h-[84px] rounded-[28px] [@media(max-height:720px)]:min-h-[68px] [@media(max-height:720px)]:rounded-[24px]"
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
        />
      </div>

      <div aria-live="polite" className="sr-only">
        {liveNotice}
      </div>
    </section>
  );
});
