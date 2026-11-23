import { memo, useState } from 'react';
import {
  computeCompensatedStampMs,
  computePreRollStartMs,
  DEFAULT_PRE_ROLL_MS,
  findNextUnsyncedWord,
  readCurrentTimeMs,
} from '@/features/sync';
import {
  usePlaybackTime,
  type PlaybackTimeStore,
} from '@/features/sync/hooks/playbackTimeStore';
import { formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import {
  Icon,
  IconButton,
  Lamps,
  RaisedButton,
  Segmented,
  SyncButton,
  WellPanel,
} from '@/ui';
import { NoAudioCard } from './NoAudioCard';
import {
  computePreRollStatus,
  resolveWordTargetStartMs,
  SYNC_MODE_OPTIONS,
  SYNC_SEGMENTED_CLASS,
  type SyncSegmentedMode,
} from './syncViewHelpers';
import { TransportBar } from './TransportBar';
import { WaveformStrip } from './WaveformStrip';

export interface WordStampFeedback {
  /** `true` cuando ya no queda ninguna palabra sin marca en toda la canción. */
  completedAll: boolean;
}

export interface WordSyncScreenProps {
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
  activeWordIndex: number;
  preRollMs?: number;
  syncMode: SyncSegmentedMode;
  onSelectMode: (mode: SyncSegmentedMode) => void;
  onSeek: (targetMs: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onPlay: () => Promise<void> | void;
  /** Salta al milisegundo y suena siempre (idempotente). */
  onPlayFrom: (targetMs: number) => void;
  onTogglePlay: () => void;
  onChangePlaybackRate: (rate: number) => void;
  onStampWordStart: (nowMs: number) => WordStampFeedback;
  /** Elige a mano la palabra de la línea activa que se va a (re)marcar. */
  onSelectWord: (wordIndex: number) => void;
  /** Deshace la última palabra sincronizada; `null` si no había nada que deshacer. */
  onUndoWord: () => { wordText: string } | null;
  canUndoWord: boolean;
  onOpenLoupe: () => void;
  onUploadAudio: (file: File) => Promise<void>;
}

interface MobilePreRollPanelProps {
  targetStartMs: number | null;
  timeStore: PlaybackTimeStore | null;
  fallbackTimeMs: number;
  preRollMs: number;
}

const MobilePreRollPanel = memo(function MobilePreRollPanel({
  targetStartMs,
  timeStore,
  fallbackTimeMs,
  preRollMs,
}: MobilePreRollPanelProps) {
  const effectiveTimeMs = usePlaybackTime(timeStore, fallbackTimeMs, 50);
  const preRoll = computePreRollStatus(targetStartMs, effectiveTimeMs, preRollMs);

  return (
    <div className="boton rounded-[18px] px-3 py-1.5 flex items-center gap-2.5 shrink-0 [@media(max-height:720px)]:px-2.5 [@media(max-height:720px)]:py-1 [@media(max-height:720px)]:gap-2">
      <Lamps
        lit={preRoll.light}
        className="shrink-0 [@media(max-height:720px)]:scale-90 [@media(max-height:720px)]:origin-left"
      />
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-sm text-ink leading-tight [@media(max-height:720px)]:text-xs">
          {preRoll.label}
        </div>
        <div className="text-xs font-semibold text-mute truncate [@media(max-height:720px)]:text-[11px]">
          cuenta regresiva del Pre-Roll
        </div>
      </div>
      <div className="font-mono text-[20px] [@media(max-height:720px)]:text-base font-bold tabular-nums text-ink shrink-0">
        {preRoll.countdownText}
      </div>
    </div>
  );
});

/**
 * Pantalla móvil de sincronización palabra por palabra con Pre-Roll, semáforo y foco
 * automático: cada marca avanza sola a la próxima palabra sin marca.
 */
export const WordSyncScreen = memo(function WordSyncScreen({
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
  activeWordIndex,
  preRollMs = DEFAULT_PRE_ROLL_MS,
  syncMode,
  onSelectMode,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onPlay,
  onPlayFrom,
  onTogglePlay,
  onChangePlaybackRate,
  onStampWordStart,
  onSelectWord,
  onUndoWord,
  canUndoWord,
  onOpenLoupe,
  onUploadAudio,
}: WordSyncScreenProps) {
  const [liveNotice, setLiveNotice] = useState('');

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
  const words = activeLine?.words ?? [];
  const targetWord = words[activeWordIndex];
  const allWordsSynced =
    findNextUnsyncedWord(lines, { lineIndex: 0, wordIndex: 0 }) === null;

  const targetStartMs = resolveWordTargetStartMs(activeLine, activeWordIndex);
  const readNowMs = () =>
    readCurrentTimeMs({ getCurrentTimeMs, timeStore, currentTimeMs });

  const handleRepeatPreRoll = () => {
    const startMs = computePreRollStartMs(targetStartMs, preRollMs);
    onPlayFrom(startMs);
    setLiveNotice(`Repitiendo Pre-Roll desde ${formatTime(startMs)}`);
  };

  const handleStampPointerDown = () => {
    if (!targetWord || allWordsSynced) {
      return;
    }
    const nowMs = computeCompensatedStampMs(readNowMs(), latencyMs);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
    if (!isPlaying) {
      void onPlay();
    }
    const feedback = onStampWordStart(nowMs);
    setLiveNotice(
      feedback.completedAll
        ? `Palabra «${targetWord.text}» marcada en ${formatTime(nowMs)}. Todas las palabras están marcadas`
        : `Palabra «${targetWord.text}» marcada en ${formatTime(nowMs)}`,
    );
  };

  const handleUndoWord = () => {
    const undone = onUndoWord();
    setLiveNotice(
      undone
        ? `Marca de «${undone.wordText}» deshecha`
        : 'No hay marcas de palabra para deshacer',
    );
  };

  const preRollSecondsLabel = (preRollMs / 1000).toFixed(1);

  return (
    <section
      aria-label="Sincronizar palabra por palabra"
      className="flex-1 min-h-0 flex flex-col gap-2 [@media(max-height:720px)]:gap-1.5"
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
        statusText={`Pre-Roll activo · ${preRollSecondsLabel} s`}
        onSeek={onSeek}
        onSeekStart={onSeekStart}
        onSeekEnd={onSeekEnd}
        onOpenLoupe={onOpenLoupe}
        canOpenLoupe={Boolean(activeLine)}
      />

      <TransportBar
        compact
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        durationMs={durationMs}
        readNowMs={readNowMs}
        onSeek={onSeek}
        onTogglePlay={onTogglePlay}
        onChangePlaybackRate={onChangePlaybackRate}
      />

      <WellPanel className="flex-1 min-h-0 p-2.5 flex flex-col justify-between gap-1.5 overflow-y-auto overscroll-contain [@media(max-height:720px)]:p-2 [@media(max-height:720px)]:gap-1">
        <div
          aria-label="Palabras de la línea"
          className="flex items-center gap-1 overflow-x-auto overscroll-contain text-[14px] [@media(max-height:720px)]:text-[13px] leading-snug font-semibold text-mute shrink-0"
        >
          {words.length > 0 ? (
            words.map((word, idx) => {
              const isTarget = idx === activeWordIndex;
              const isDone = word.startMs !== null && !isTarget;
              return (
                <button
                  key={word.id}
                  type="button"
                  onClick={() => onSelectWord(idx)}
                  aria-current={isTarget ? 'true' : undefined}
                  aria-label={`Elegir palabra «${word.text}»`}
                  className={`shrink-0 min-h-11 min-w-11 px-2.5 inline-flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc rounded-[12px] ${
                    isTarget
                      ? 'bg-bg boton text-ink font-extrabold underline decoration-acc decoration-2 underline-offset-4'
                      : isDone
                        ? 'text-ok font-extrabold'
                        : 'text-mute'
                  }`}
                >
                  {word.text}
                </button>
              );
            })
          ) : (
            <span>Sin palabras en la línea activa.</span>
          )}
        </div>

        <div className="text-center shrink-0">
          <div className="text-[11px] [@media(max-height:720px)]:text-[10px] font-extrabold tracking-[0.12em] text-mute uppercase">
            PALABRA OBJETIVO
          </div>
          <div className="text-[72px] [@media(max-height:740px)]:text-[clamp(1.85rem,5.8vh,2.75rem)] font-extrabold leading-none text-acc mt-0.5 break-words">
            {targetWord ? targetWord.text : '—'}
          </div>
        </div>

        <MobilePreRollPanel
          targetStartMs={targetStartMs}
          timeStore={timeStore}
          fallbackTimeMs={currentTimeMs}
          preRollMs={preRollMs}
        />
      </WellPanel>

      <RaisedButton
        onClick={handleRepeatPreRoll}
        disabled={!targetWord}
        className="w-full min-h-12 [@media(max-height:720px)]:min-h-10 text-acc font-extrabold shrink-0"
      >
        <Icon name="replay" size={18} />
        <span>{`Repetir Pre-Roll −${preRollSecondsLabel} s`}</span>
      </RaisedButton>

      <div className="flex items-center gap-2 flex-none">
        <IconButton
          aria-label="Deshacer última palabra"
          disabled={!canUndoWord}
          onClick={handleUndoWord}
          className="min-h-11 min-w-11 shrink-0"
        >
          <Icon name="undo" size={18} />
        </IconButton>

        <SyncButton
          title="MARCAR PALABRA"
          hint={
            allWordsSynced
              ? 'Todas las palabras están marcadas · deshaz para re-marcar'
              : targetWord
                ? `Toca al sonar «${targetWord.text}»`
                : 'Selecciona una línea con palabras'
          }
          disabled={!targetWord || allWordsSynced}
          onPointerDown={handleStampPointerDown}
          onContextMenu={(e) => e.preventDefault()}
          className="flex-1 min-w-0 w-auto min-h-[96px] [@media(max-height:720px)]:min-h-[68px] [@media(max-height:720px)]:rounded-[26px]"
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
        />
      </div>

      <div aria-live="polite" className="sr-only">
        {liveNotice}
      </div>
    </section>
  );
});
