import { memo } from 'react';
import { DEFAULT_PRE_ROLL_MS } from '@/features/sync';
import {
  computePreRollStatus,
  resolveWordTargetStartMs,
} from '@/features/sync/components/syncViewHelpers';
import {
  usePlaybackTime,
  type PlaybackTimeStore,
} from '@/features/sync/hooks/playbackTimeStore';
import type { LyricLine } from '@/types';
import { Icon, Lamps, RaisedButton, SyncButton, WellPanel } from '@/ui';

export interface DesktopWordStageProps {
  activeLine: LyricLine | undefined;
  activeWordIndex: number;
  timeStore?: PlaybackTimeStore | null;
  currentTimeMs?: number;
  preRollMs?: number;
  /** `true` cuando ya no queda ninguna palabra sin marca en toda la canción. */
  allWordsSynced?: boolean;
  onSelectWord: (wordIndex: number) => void;
  onRepeatPreRoll: () => void;
  onStampWordStart: () => void;
}

const DesktopPreRollStatus = memo(function DesktopPreRollStatus({
  targetStartMs,
  timeStore,
  fallbackTimeMs,
  preRollMs,
}: {
  targetStartMs: number | null;
  timeStore: PlaybackTimeStore | null;
  fallbackTimeMs: number;
  preRollMs: number;
}) {
  const effectiveTimeMs = usePlaybackTime(timeStore, fallbackTimeMs, 50);
  const preRoll = computePreRollStatus(targetStartMs, effectiveTimeMs, preRollMs);

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <Lamps lit={preRoll.light} />
      <div className="font-mono text-[22px] font-bold tabular-nums text-ink">
        {preRoll.countdownText}
      </div>
      <div className="font-extrabold text-sm text-ink">{preRoll.label}</div>
    </div>
  );
});

/**
 * Visor de palabra objetivo en escritorio con semáforo Pre-Roll,
 * foco automático, botón Repetir Pre-Roll y MARCAR PALABRA.
 */
export const DesktopWordStage = memo(function DesktopWordStage({
  activeLine,
  activeWordIndex,
  timeStore = null,
  currentTimeMs = 0,
  preRollMs = DEFAULT_PRE_ROLL_MS,
  allWordsSynced = false,
  onSelectWord,
  onRepeatPreRoll,
  onStampWordStart,
}: DesktopWordStageProps) {
  const words = activeLine?.words ?? [];
  const targetWord = words[activeWordIndex];
  const targetStartMs = resolveWordTargetStartMs(activeLine, activeWordIndex);

  return (
    <WellPanel className="p-6 flex flex-col items-center gap-3.5 text-center">
      <div className="text-[18px] font-semibold text-mute leading-snug">
        {words.length > 0 ? (
          words.map((word, idx) => {
            const isTarget = idx === activeWordIndex;
            const isDone = word.startMs !== null && !isTarget;
            return (
              <span key={word.id}>
                {idx > 0 ? ' ' : ''}
                <button
                  type="button"
                  onClick={() => onSelectWord(idx)}
                  aria-current={isTarget ? 'true' : undefined}
                  aria-label={`Elegir palabra «${word.text}»`}
                  className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc rounded-[6px] ${
                    isTarget
                      ? 'text-ink font-extrabold underline decoration-acc decoration-2 underline-offset-[6px]'
                      : isDone
                        ? 'text-ok font-extrabold'
                        : 'text-mute'
                  }`}
                >
                  {word.text}
                </button>
              </span>
            );
          })
        ) : (
          <span>Sin palabras en la línea activa.</span>
        )}
      </div>

      <div className="text-xs font-extrabold tracking-[0.12em] text-mute uppercase">
        PALABRA OBJETIVO
      </div>

      <div className="text-[clamp(3rem,6vw,5.5rem)] font-extrabold leading-none text-acc break-words max-w-full">
        {targetWord ? targetWord.text : '—'}
      </div>

      <DesktopPreRollStatus
        targetStartMs={targetStartMs}
        timeStore={timeStore}
        fallbackTimeMs={currentTimeMs}
        preRollMs={preRollMs}
      />

      {allWordsSynced ? (
        <p role="status" className="m-0 text-xs font-bold text-mute">
          Todas las palabras están marcadas. Deshaz (Z) para re-marcar la última.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
        <RaisedButton
          onClick={onRepeatPreRoll}
          disabled={!targetWord}
          className="min-h-14 text-acc font-extrabold"
        >
          <Icon name="replay" size={18} />
          <span>Repetir Pre-Roll</span>
        </RaisedButton>

        <SyncButton
          title="MARCAR PALABRA"
          disabled={!targetWord || allWordsSynced}
          onPointerDown={onStampWordStart}
          onContextMenu={(e) => e.preventDefault()}
          className="min-h-14 h-14 px-8 rounded-[20px] min-w-[240px]"
          style={{
            touchAction: 'manipulation',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
        />
      </div>
    </WellPanel>
  );
});
