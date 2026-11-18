import { useState } from 'react';
import { computePreRollStartMs, DEFAULT_PRE_ROLL_MS } from '@/features/sync';
import { formatTime } from '@/lib/time';
import type { LyricLine, WordSyncSubMode } from '@/types';
import {
  Icon,
  Lamps,
  Pill,
  RaisedButton,
  Segmented,
  SyncButton,
  WellPanel,
} from '@/ui';
import type { SyncSegmentedMode } from './LineSyncScreen';
import { NoAudioCard } from './NoAudioCard';
import {
  computePreRollStatus,
  resolveWordTargetStartMs,
} from './syncViewHelpers';
import { WaveformStrip } from './WaveformStrip';

export interface WordStampFeedback {
  shouldPause: boolean;
  shouldRewindPreRoll: boolean;
  completedLine: boolean;
}

export interface WordSyncScreenProps {
  hasAudio: boolean;
  peaks: readonly number[];
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  lines: readonly LyricLine[];
  activeLineIndex: number;
  activeWordIndex: number;
  preRollMs?: number;
  sniperMode: boolean;
  holdMode: boolean;
  syncMode: SyncSegmentedMode;
  onSelectMode: (mode: SyncSegmentedMode) => void;
  onToggleSniper: () => void;
  onToggleHold: () => void;
  onSeek: (targetMs: number) => void;
  onPlay: () => Promise<void> | void;
  onPause: () => void;
  onStampWordStart: (params: {
    nowMs: number;
    subMode: WordSyncSubMode;
    sniperHoldDuration: boolean;
    sniperAutoAdvancePreRoll: boolean;
  }) => WordStampFeedback;
  onStampWordEnd: (params: {
    nowMs: number;
    subMode: WordSyncSubMode;
    sniperHoldDuration: boolean;
    sniperAutoAdvancePreRoll: boolean;
  }) => WordStampFeedback;
  onOpenLoupe: () => void;
  onUploadAudio: (file: File) => Promise<void>;
  onUseDemo: () => Promise<void>;
}

const MODE_OPTIONS: readonly { value: SyncSegmentedMode; label: string }[] = [
  { value: 'line', label: 'Línea' },
  { value: 'word', label: 'Palabra' },
  { value: 'burst', label: 'Ráfaga' },
];

/**
 * Pantalla móvil de sincronización palabra por palabra con Pre-Roll, semáforo,
 * modo Francotirador y modo mantener.
 */
export function WordSyncScreen({
  hasAudio,
  peaks,
  currentTimeMs,
  durationMs,
  isPlaying,
  lines,
  activeLineIndex,
  activeWordIndex,
  preRollMs = DEFAULT_PRE_ROLL_MS,
  sniperMode,
  holdMode,
  syncMode,
  onSelectMode,
  onToggleSniper,
  onToggleHold,
  onSeek,
  onPlay,
  onPause,
  onStampWordStart,
  onStampWordEnd,
  onOpenLoupe,
  onUploadAudio,
  onUseDemo,
}: WordSyncScreenProps) {
  const [liveNotice, setLiveNotice] = useState('');
  const [isHolding, setIsHolding] = useState(false);

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
  const words = activeLine?.words ?? [];
  const targetWord = words[activeWordIndex];
  const prevWord = activeWordIndex > 0 ? words[activeWordIndex - 1] : undefined;
  const nextWord =
    activeWordIndex + 1 < words.length ? words[activeWordIndex + 1] : undefined;

  const targetStartMs = resolveWordTargetStartMs(activeLine, activeWordIndex);
  const preRoll = computePreRollStatus(targetStartMs, currentTimeMs, preRollMs);
  const subMode: WordSyncSubMode = sniperMode
    ? 'sniper'
    : holdMode
      ? 'hold'
      : 'tap';

  const applyFeedback = (feedback: WordStampFeedback) => {
    if (feedback.shouldPause) {
      onPause();
    } else if (feedback.shouldRewindPreRoll) {
      const nextTarget = resolveWordTargetStartMs(activeLine, activeWordIndex + 1);
      onSeek(computePreRollStartMs(nextTarget ?? currentTimeMs, preRollMs));
      void onPlay();
    }
  };

  const handleRepeatPreRoll = () => {
    const startMs = computePreRollStartMs(targetStartMs, preRollMs);
    onSeek(startMs);
    void onPlay();
    setLiveNotice(`Repitiendo Pre-Roll desde ${formatTime(startMs)}`);
  };

  const handleStampPointerDown = () => {
    if (!targetWord) {
      return;
    }
    const nowMs = currentTimeMs;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
    if (holdMode) {
      setIsHolding(true);
    }
    if (!isPlaying) {
      void onPlay();
    }
    const feedback = onStampWordStart({
      nowMs,
      subMode,
      sniperHoldDuration: holdMode,
      sniperAutoAdvancePreRoll: true,
    });
    setLiveNotice(`Palabra «${targetWord.text}» marcada en ${formatTime(nowMs)}`);
    if (!holdMode) {
      applyFeedback(feedback);
    }
  };

  const handleStampPointerUp = () => {
    if (!holdMode || !isHolding || !targetWord) {
      return;
    }
    setIsHolding(false);
    const nowMs = currentTimeMs;
    const feedback = onStampWordEnd({
      nowMs,
      subMode,
      sniperHoldDuration: holdMode,
      sniperAutoAdvancePreRoll: true,
    });
    applyFeedback(feedback);
  };

  const preRollSecondsLabel = (preRollMs / 1000).toFixed(1);

  return (
    <section
      aria-label="Sincronizar palabra por palabra"
      className="flex-1 min-h-0 flex flex-col gap-2.5"
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
        compact
        statusText={`Pre-Roll activo · ${preRollSecondsLabel} s`}
        onSeek={onSeek}
        onOpenLoupe={onOpenLoupe}
        canOpenLoupe={Boolean(activeLine)}
      />

      <WellPanel className="flex-1 min-h-0 p-3 flex flex-col gap-1.5 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <RaisedButton
            size="sm"
            variant={sniperMode ? 'acc' : 'default'}
            aria-pressed={sniperMode}
            onClick={onToggleSniper}
            className="flex-1 min-h-12 py-0 text-xs font-extrabold"
          >
            Francotirador
          </RaisedButton>
          <RaisedButton
            size="sm"
            variant={holdMode ? 'acc' : 'default'}
            aria-pressed={holdMode}
            onClick={onToggleHold}
            className="flex-1 min-h-12 py-0 text-xs font-extrabold"
          >
            Mantener
          </RaisedButton>
        </div>

        <div className="text-[14px] leading-snug font-semibold text-mute">
          {words.length > 0 ? (
            words.map((word, idx) => {
              const isTarget = idx === activeWordIndex;
              const isDone = word.startMs !== null && !isTarget;
              return (
                <span key={word.id}>
                  {idx > 0 ? ' ' : ''}
                  <span
                    className={
                      isTarget
                        ? 'bg-bg boton px-2 py-0.5 rounded-[9px] text-ink font-extrabold underline decoration-acc decoration-2 underline-offset-4'
                        : isDone
                          ? 'text-ok font-extrabold'
                          : 'text-mute'
                    }
                  >
                    {word.text}
                  </span>
                </span>
              );
            })
          ) : (
            <span>Sin palabras en la línea activa.</span>
          )}
        </div>

        <div className="text-center my-auto">
          <div className="text-[11px] font-extrabold tracking-[0.12em] text-mute uppercase">
            PALABRA OBJETIVO
          </div>
          <div className="text-[72px] font-extrabold leading-none text-acc mt-0.5 break-words">
            {targetWord ? targetWord.text : '—'}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Pill variant="mute" className="truncate max-w-[48%]">
            {prevWord ? `← ${prevWord.text}` : '← inicio'}
          </Pill>
          <Pill variant="mute" className="truncate max-w-[48%]">
            {nextWord ? `${nextWord.text} →` : 'fin →'}
          </Pill>
        </div>

        <div className="boton rounded-[18px] px-3 py-2 flex items-center gap-3">
          <Lamps lit={preRoll.light} />
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-sm text-ink">{preRoll.label}</div>
            <div className="text-xs font-semibold text-mute truncate">
              cuenta regresiva del Pre-Roll
            </div>
          </div>
          <div className="font-mono text-[20px] font-bold tabular-nums text-ink shrink-0">
            {preRoll.countdownText}
          </div>
        </div>
      </WellPanel>

      <RaisedButton
        onClick={handleRepeatPreRoll}
        disabled={!targetWord}
        className="w-full min-h-12 text-acc font-extrabold"
      >
        <Icon name="replay" size={18} />
        <span>{`Repetir Pre-Roll −${preRollSecondsLabel} s`}</span>
      </RaisedButton>

      <SyncButton
        title="MARCAR PALABRA"
        hint={
          targetWord
            ? `Toca al sonar «${targetWord.text}» · mantén para sílabas`
            : 'Selecciona una línea con palabras'
        }
        disabled={!targetWord}
        onPointerDown={handleStampPointerDown}
        onPointerUp={handleStampPointerUp}
        onPointerCancel={() => setIsHolding(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="min-h-[96px]"
        style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
      />

      <div aria-live="polite" className="sr-only">
        {liveNotice}
      </div>
    </section>
  );
}
