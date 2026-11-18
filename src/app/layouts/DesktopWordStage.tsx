import { DEFAULT_PRE_ROLL_MS } from '@/features/sync';
import {
  computePreRollStatus,
  resolveWordTargetStartMs,
} from '@/features/sync/components/syncViewHelpers';
import type { LyricLine } from '@/types';
import { Icon, Lamps, RaisedButton, SyncButton, WellPanel } from '@/ui';

export interface DesktopWordStageProps {
  activeLine: LyricLine | undefined;
  activeWordIndex: number;
  currentTimeMs: number;
  preRollMs?: number;
  sniperMode: boolean;
  holdMode: boolean;
  onToggleSniper: () => void;
  onToggleHold: () => void;
  onRepeatPreRoll: () => void;
  onStampWordStart: () => void;
  onStampWordEnd: () => void;
}

/**
 * Visor de palabra objetivo en escritorio con semáforo Pre-Roll,
 * modos Francotirador/Mantener, botón Repetir Pre-Roll y MARCAR PALABRA.
 */
export function DesktopWordStage({
  activeLine,
  activeWordIndex,
  currentTimeMs,
  preRollMs = DEFAULT_PRE_ROLL_MS,
  sniperMode,
  holdMode,
  onToggleSniper,
  onToggleHold,
  onRepeatPreRoll,
  onStampWordStart,
  onStampWordEnd,
}: DesktopWordStageProps) {
  const words = activeLine?.words ?? [];
  const targetWord = words[activeWordIndex];
  const targetStartMs = resolveWordTargetStartMs(activeLine, activeWordIndex);
  const preRoll = computePreRollStatus(targetStartMs, currentTimeMs, preRollMs);

  return (
    <WellPanel className="p-6 flex flex-col items-center gap-3.5 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2 w-full">
        <RaisedButton
          size="sm"
          variant={sniperMode ? 'acc' : 'default'}
          aria-pressed={sniperMode}
          onClick={onToggleSniper}
          className="min-h-10 px-3.5 text-xs font-extrabold"
        >
          Francotirador
        </RaisedButton>
        <RaisedButton
          size="sm"
          variant={holdMode ? 'acc' : 'default'}
          aria-pressed={holdMode}
          onClick={onToggleHold}
          className="min-h-10 px-3.5 text-xs font-extrabold"
        >
          Mantener
        </RaisedButton>
      </div>

      <div className="text-[18px] font-semibold text-mute leading-snug">
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
                      ? 'text-ink font-extrabold underline decoration-acc decoration-2 underline-offset-[6px]'
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

      <div className="text-xs font-extrabold tracking-[0.12em] text-mute uppercase">
        PALABRA OBJETIVO
      </div>

      <div className="text-[clamp(3rem,6vw,5.5rem)] font-extrabold leading-none text-acc break-words max-w-full">
        {targetWord ? targetWord.text : '—'}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-5">
        <Lamps lit={preRoll.light} />
        <div className="font-mono text-[22px] font-bold tabular-nums text-ink">
          {preRoll.countdownText}
        </div>
        <div className="font-extrabold text-sm text-ink">{preRoll.label}</div>
      </div>

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
          disabled={!targetWord}
          onPointerDown={onStampWordStart}
          onPointerUp={onStampWordEnd}
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
}
