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
import { NoAudioCard } from './NoAudioCard';
import {
  computePreRollStatus,
  resolveWordTargetStartMs,
  SYNC_MODE_OPTIONS,
  SYNC_SEGMENTED_CLASS,
  type SyncSegmentedMode,
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
          options={SYNC_MODE_OPTIONS}
          value={syncMode}
          onChange={onSelectMode}
          aria-label="Modo de sincronización"
          className={SYNC_SEGMENTED_CLASS}
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
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        lines={lines}
        compact
        statusText={`Pre-Roll activo · ${preRollSecondsLabel} s`}
        onSeek={onSeek}
        onOpenLoupe={onOpenLoupe}
        canOpenLoupe={Boolean(activeLine)}
      />

      <WellPanel className="flex-1 min-h-0 p-2.5 flex flex-col justify-between gap-1.5 overflow-y-auto [@media(max-height:720px)]:p-2 [@media(max-height:720px)]:gap-1">
        <div className="flex items-center gap-2 shrink-0">
          <RaisedButton
            size="sm"
            variant={sniperMode ? 'acc' : 'default'}
            aria-pressed={sniperMode}
            onClick={onToggleSniper}
            className="flex-1 min-h-11 [@media(max-height:720px)]:min-h-[34px] rounded-[14px] py-0 px-2.5 text-xs font-extrabold"
          >
            Francotirador
          </RaisedButton>
          <RaisedButton
            size="sm"
            variant={holdMode ? 'acc' : 'default'}
            aria-pressed={holdMode}
            onClick={onToggleHold}
            className="flex-1 min-h-11 [@media(max-height:720px)]:min-h-[34px] rounded-[14px] py-0 px-2.5 text-xs font-extrabold"
          >
            Mantener
          </RaisedButton>
        </div>

        <div className="text-[14px] [@media(max-height:720px)]:text-[13px] leading-snug font-semibold text-mute shrink-0">
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

        <div className="text-center shrink-0">
          <div className="text-[11px] [@media(max-height:720px)]:text-[10px] font-extrabold tracking-[0.12em] text-mute uppercase">
            PALABRA OBJETIVO
          </div>
          <div className="text-[72px] [@media(max-height:740px)]:text-[clamp(1.85rem,5.8vh,2.75rem)] font-extrabold leading-none text-acc mt-0.5 break-words">
            {targetWord ? targetWord.text : '—'}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 shrink-0">
          <Pill variant="mute" className="truncate max-w-[48%] [@media(max-height:720px)]:py-0.5 [@media(max-height:720px)]:text-[11px]">
            {prevWord ? `← ${prevWord.text}` : '← inicio'}
          </Pill>
          <Pill variant="mute" className="truncate max-w-[48%] [@media(max-height:720px)]:py-0.5 [@media(max-height:720px)]:text-[11px]">
            {nextWord ? `${nextWord.text} →` : 'fin →'}
          </Pill>
        </div>

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
      </WellPanel>

      <RaisedButton
        onClick={handleRepeatPreRoll}
        disabled={!targetWord}
        className="w-full min-h-12 [@media(max-height:720px)]:min-h-10 text-acc font-extrabold shrink-0"
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
        className="min-h-[96px] [@media(max-height:720px)]:min-h-[68px] [@media(max-height:720px)]:rounded-[26px]"
        style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
      />

      <div aria-live="polite" className="sr-only">
        {liveNotice}
      </div>
    </section>
  );
}
