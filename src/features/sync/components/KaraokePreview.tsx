import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';
import { computeKaraokeState } from '@/features/sync';
import type { PlaybackTimeStore } from '@/features/sync/hooks/playbackTimeStore';
import { formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { Icon, IconButton, Pill, Segmented, WellPanel } from '@/ui';
import { NoAudioCard } from './NoAudioCard';
import {
  formatUnsyncedLinesNotice,
  SYNC_MODE_OPTIONS,
  SYNC_SEGMENTED_CLASS,
  type SyncSegmentedMode,
} from './syncViewHelpers';

export interface KaraokePreviewProps {
  hasAudio: boolean;
  durationMs: number;
  isPlaying: boolean;
  lines: readonly LyricLine[];
  syncMode: SyncSegmentedMode;
  timeStore?: PlaybackTimeStore | null;
  pausedTimeMs?: number;
  getCurrentTimeMs: () => number;
  onSelectMode: (mode: SyncSegmentedMode) => void;
  onTogglePlay: () => void;
  onSeek: (targetMs: number) => void;
  onUploadAudio: (file: File) => Promise<void>;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Vista previa de karaoke a 60 FPS sin re-renderizados de React por fotograma:
 * actualiza variables CSS (`--karaoke-fill`) y estados DOM mediante refs y `requestAnimationFrame`.
 */
export const KaraokePreview = memo(function KaraokePreview({
  hasAudio,
  durationMs,
  isPlaying,
  lines,
  syncMode,
  timeStore = null,
  pausedTimeMs = -1,
  getCurrentTimeMs,
  onSelectMode,
  onTogglePlay,
  onSeek,
  onUploadAudio,
}: KaraokePreviewProps) {
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const wordFillRefs = useRef<(HTMLSpanElement | null)[][]>([]);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const lastActiveLineRef = useRef<number>(-1);
  const lastWordFillRef = useRef<number[][]>([]);
  const rafRef = useRef<number | null>(null);

  const initialTimeMs = timeStore
    ? timeStore.getTimeMs()
    : pausedTimeMs >= 0
      ? pausedTimeMs
      : getCurrentTimeMs();
  const initialState = computeKaraokeState(lines, initialTimeMs);
  const unsyncedNotice = formatUnsyncedLinesNotice(
    initialState.syncedLinesCount,
    initialState.unsyncedLinesCount,
  );

  const applyFrame = useCallback(
    (nowMs: number) => {
      if (timeRef.current) {
        const formatted = formatTime(nowMs);
        if (timeRef.current.textContent !== formatted) {
          timeRef.current.textContent = formatted;
        }
      }

      const frame = computeKaraokeState(lines, nowMs);

      for (let i = 0; i < frame.lines.length; i++) {
        const lineState = frame.lines[i];
        const lineEl = lineRefs.current[i];
        if (!lineState || !lineEl) {
          continue;
        }

        const nextDomState = lineState.isActive
          ? 'active'
          : lineState.isPast
            ? 'past'
            : 'upcoming';
        if (lineEl.dataset.state !== nextDomState) {
          lineEl.dataset.state = nextDomState;
        }

        const rowFills = wordFillRefs.current[i];
        if (!rowFills) {
          continue;
        }
        let prevRow = lastWordFillRef.current[i];
        if (!prevRow) {
          prevRow = [];
          lastWordFillRef.current[i] = prevRow;
        }

        for (let j = 0; j < lineState.wordProgressPct.length; j++) {
          const pct = lineState.wordProgressPct[j] ?? 0;
          const wordEl = rowFills[j];
          if (wordEl && prevRow[j] !== pct) {
            prevRow[j] = pct;
            wordEl.style.setProperty('--karaoke-fill', `${pct}%`);
          }
        }
      }

      if (frame.activeLineIndex !== lastActiveLineRef.current) {
        lastActiveLineRef.current = frame.activeLineIndex;
        if (frame.activeLineIndex >= 0) {
          const activeEl = lineRefs.current[frame.activeLineIndex];
          if (activeEl && typeof activeEl.scrollIntoView === 'function') {
            activeEl.scrollIntoView({
              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'center',
            });
          }
        }
      }
    },
    [lines],
  );

  // Sincronización inicial o cuando cambia el tiempo estando en pausa (sin re-renderizar React).
  useEffect(() => {
    lastWordFillRef.current = [];
    const targetMs = timeStore
      ? timeStore.getTimeMs()
      : pausedTimeMs >= 0
        ? pausedTimeMs
        : getCurrentTimeMs();
    applyFrame(targetMs);
  }, [applyFrame, getCurrentTimeMs, pausedTimeMs, timeStore]);

  useEffect(() => {
    if (!hasAudio || isPlaying || !timeStore) {
      return;
    }
    return timeStore.subscribe(() => {
      applyFrame(timeStore.getTimeMs());
    });
  }, [applyFrame, hasAudio, isPlaying, timeStore]);

  // Bucle a 60 FPS con requestAnimationFrame durante reproducción sin setState.
  useEffect(() => {
    if (!hasAudio || !isPlaying || typeof requestAnimationFrame !== 'function') {
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      applyFrame(getCurrentTimeMs());
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [applyFrame, getCurrentTimeMs, hasAudio, isPlaying]);

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

  return (
    <section
      aria-label="Vista previa Karaoke"
      className="flex-1 min-h-0 flex flex-col gap-2.5 [@media(max-height:720px)]:gap-1.5"
    >
      <Segmented
        options={SYNC_MODE_OPTIONS}
        value={syncMode}
        onChange={onSelectMode}
        aria-label="Modo de sincronización"
        className={SYNC_SEGMENTED_CLASS}
      />

      <div className="boton rounded-[20px] px-3 py-2 flex items-center justify-between gap-2 flex-none [@media(max-height:720px)]:py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Pill variant="acc" className="whitespace-nowrap shrink-0">
            60 FPS
          </Pill>
          <div className="flex flex-col leading-tight min-w-0 font-mono tabular-nums">
            <span
              ref={timeRef}
              className="text-xs font-bold text-ink whitespace-nowrap"
            >
              {formatTime(initialTimeMs)}
            </span>
            <span className="text-[10px] font-semibold text-mute whitespace-nowrap">
              {`/ ${formatTime(durationMs)}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <IconButton
            round
            aria-label="Retroceder 5 segundos"
            onClick={() => onSeek(Math.max(0, getCurrentTimeMs() - 5000))}
          >
            <Icon name="rewind" size={18} />
          </IconButton>

          <IconButton
            round
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            onClick={onTogglePlay}
            className="text-acc"
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
          </IconButton>

          <IconButton
            round
            aria-label="Adelantar 5 segundos"
            onClick={() => onSeek(Math.min(durationMs, getCurrentTimeMs() + 5000))}
          >
            <Icon name="forward" size={18} />
          </IconButton>
        </div>
      </div>

      {unsyncedNotice ? (
        <div
          role="status"
          className="hundido rounded-[16px] px-3.5 py-2 text-xs font-semibold text-ink flex items-start gap-2 border border-acc/30 flex-none"
        >
          <Icon
            name="sync"
            size={16}
            className="text-acc shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="m-0 leading-snug">{unsyncedNotice}</p>
        </div>
      ) : null}

      <WellPanel className="flex-1 min-h-0 px-4 py-4 overflow-y-auto flex flex-col gap-3">
        {lines.length > 0 ? (
          lines.map((line, lIdx) => {
            const lineState = initialState.lines[lIdx];
            const domState = lineState?.isActive
              ? 'active'
              : lineState?.isPast
                ? 'past'
                : 'upcoming';
            const isSynced = line.startMs !== null;
            const tokens =
              line.words.length > 0
                ? line.words
                : [{ id: `${line.id}-full`, text: line.text, startMs: line.startMs, endMs: line.endMs }];

            const sharedClass =
              'w-full shrink-0 min-h-12 px-3.5 py-3 rounded-[18px] text-center transition-all duration-200 motion-reduce:transition-none data-[state=active]:bg-bg data-[state=active]:shadow-relieve data-[state=active]:ring-1 data-[state=active]:ring-acc/20 data-[state=active]:opacity-100 data-[state=past]:opacity-40 data-[state=upcoming]:opacity-65';

            const wordSpans = (
              <span className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-[21px] sm:text-[23px] font-extrabold leading-snug tracking-tight">
                {tokens.map((word, wIdx) => {
                  const initialPct = lineState?.wordProgressPct[wIdx] ?? 0;
                  const fillStyle = {
                    '--karaoke-fill': `${initialPct}%`,
                    width: 'var(--karaoke-fill, 0%)',
                  } as CSSProperties;

                  return (
                    <span key={word.id} className="relative inline-block">
                      <span className="text-mute/55 select-none">{word.text}</span>
                      <span
                        ref={(el) => {
                          if (!wordFillRefs.current[lIdx]) {
                            wordFillRefs.current[lIdx] = [];
                          }
                          wordFillRefs.current[lIdx][wIdx] = el;
                        }}
                        aria-hidden="true"
                        className="absolute left-0 top-0 overflow-hidden text-acc whitespace-nowrap pointer-events-none select-none"
                        style={fillStyle}
                      >
                        {word.text}
                      </span>
                    </span>
                  );
                })}
              </span>
            );

            if (isSynced && line.startMs !== null) {
              const targetMs = line.startMs;
              return (
                <button
                  key={line.id}
                  ref={(el) => {
                    lineRefs.current[lIdx] = el;
                  }}
                  type="button"
                  data-state={domState}
                  onClick={() => onSeek(targetMs)}
                  aria-label={`Ir a línea ${lIdx + 1}: ${line.text}`}
                  className={`${sharedClass} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc`}
                >
                  {wordSpans}
                </button>
              );
            }

            return (
              <div
                key={line.id}
                ref={(el) => {
                  lineRefs.current[lIdx] = el;
                }}
                data-state={domState}
                className={sharedClass}
              >
                {wordSpans}
              </div>
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center p-4 text-center text-sm font-semibold text-mute">
            Aún no hay letra cargada. Agrega líneas en la pestaña Letra.
          </div>
        )}
      </WellPanel>
    </section>
  );
});
