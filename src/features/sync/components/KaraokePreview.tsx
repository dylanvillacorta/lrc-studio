import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';
import { computeKaraokeState } from '@/features/sync';
import {
  animateScrollToCenter,
  cancelScrollAnimationRef,
} from '@/features/sync/hooks/useCenteredListScroll';
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
  showModeSelector?: boolean;
  onSelectMode: (mode: SyncSegmentedMode) => void;
  onTogglePlay: () => void;
  onSeek: (targetMs: number) => void;
  onUploadAudio: (file: File) => Promise<void>;
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
  showModeSelector = true,
  onSelectMode,
  onTogglePlay,
  onSeek,
  onUploadAudio,
}: KaraokePreviewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const wordFillRefs = useRef<(HTMLSpanElement | null)[][]>([]);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const lastActiveLineRef = useRef<number>(-1);
  const hasCenteredInitiallyRef = useRef<boolean>(false);
  const lastWordFillRef = useRef<number[][]>([]);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const getCurrentTimeMsRef = useRef(getCurrentTimeMs);
  getCurrentTimeMsRef.current = getCurrentTimeMs;

  const cancelScrollAnimation = useCallback(() => {
    cancelScrollAnimationRef(scrollRafRef);
  }, []);

  const scrollLineIntoCenter = useCallback(
    (lineIndex: number, instant: boolean) => {
      const container = scrollContainerRef.current;
      const activeEl = lineRefs.current[lineIndex];
      if (!container || !activeEl) {
        return;
      }
      animateScrollToCenter({
        container,
        targetEl: activeEl,
        instant,
        rafRef: scrollRafRef,
      });
    },
    [],
  );

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
          const isInitial = !hasCenteredInitiallyRef.current;
          hasCenteredInitiallyRef.current = true;
          scrollLineIntoCenter(frame.activeLineIndex, isInitial);
        }
      }
    },
    [lines, scrollLineIntoCenter],
  );

  // Limpia refs obsoletos cuando cambia la estructura de líneas.
  useEffect(() => {
    lineRefs.current.length = lines.length;
    wordFillRefs.current.length = lines.length;
    lastWordFillRef.current = [];
    lastActiveLineRef.current = -1;
    hasCenteredInitiallyRef.current = false;
  }, [lines]);

  // Sincronización inicial o cuando cambia el tiempo estando en pausa (sin re-renderizar React).
  useEffect(() => {
    if (isPlaying) {
      return;
    }
    const targetMs = timeStore
      ? timeStore.getTimeMs()
      : pausedTimeMs >= 0
        ? pausedTimeMs
        : getCurrentTimeMsRef.current();
    applyFrame(targetMs);
  }, [applyFrame, isPlaying, pausedTimeMs, timeStore]);

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

    applyFrame(getCurrentTimeMsRef.current());

    const tick = () => {
      applyFrame(getCurrentTimeMsRef.current());
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [applyFrame, hasAudio, isPlaying]);

  useEffect(() => cancelScrollAnimation, [cancelScrollAnimation]);

  // Re-centra la línea activa si cambia el tamaño del contenedor (rotación o redimensionado).
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || typeof ResizeObserver !== 'function') {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (lastActiveLineRef.current >= 0) {
        scrollLineIntoCenter(lastActiveLineRef.current, true);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollLineIntoCenter]);

  if (!hasAudio) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        {showModeSelector ? (
          <Segmented
            options={SYNC_MODE_OPTIONS}
            value={syncMode}
            onChange={onSelectMode}
            aria-label="Modo de sincronización"
            className={SYNC_SEGMENTED_CLASS}
          />
        ) : null}
        <NoAudioCard onUploadAudio={onUploadAudio} />
      </div>
    );
  }

  return (
    <section
      aria-label="Vista previa Karaoke"
      className="flex-1 min-h-0 flex flex-col gap-2.5 [@media(max-height:720px)]:gap-1.5"
    >
      {showModeSelector ? (
        <Segmented
          options={SYNC_MODE_OPTIONS}
          value={syncMode}
          onChange={onSelectMode}
          aria-label="Modo de sincronización"
          className={SYNC_SEGMENTED_CLASS}
        />
      ) : null}

      <div className="boton rounded-[20px] px-3 py-2 flex items-center justify-between gap-2 flex-none [@media(max-height:720px)]:py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Pill variant="acc" className="whitespace-nowrap shrink-0">
            60 FPS
          </Pill>
          <div className="flex flex-col leading-tight min-w-0 font-mono tabular-nums">
            <span
              ref={timeRef}
              aria-label="Tiempo actual"
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
            onClick={() => onSeek(Math.max(0, getCurrentTimeMsRef.current() - 5000))}
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
            onClick={() => onSeek(Math.min(durationMs, getCurrentTimeMsRef.current() + 5000))}
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

      <WellPanel className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
        <div
          ref={scrollContainerRef}
          onWheel={cancelScrollAnimation}
          onTouchStart={cancelScrollAnimation}
          className="flex-1 min-h-0 px-3 sm:px-5 py-4 overflow-y-auto overscroll-contain flex flex-col gap-2.5 sm:gap-3"
        >
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

              if (wordFillRefs.current[lIdx]) {
                wordFillRefs.current[lIdx].length = tokens.length;
              }

              const sharedClass =
                'group w-full shrink-0 min-h-12 px-3.5 py-3 rounded-[18px] text-center transition-opacity duration-150 motion-reduce:transition-none data-[state=active]:bg-bg data-[state=active]:shadow-relieve data-[state=active]:ring-1 data-[state=active]:ring-acc/25 data-[state=active]:opacity-100 data-[state=past]:opacity-45 data-[state=upcoming]:opacity-75';

              const wordSpans = (
                <span className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-[19px] min-[390px]:text-[21px] sm:text-[23px] font-extrabold leading-snug tracking-tight">
                  {tokens.map((word, wIdx) => {
                    const initialPct = lineState?.wordProgressPct[wIdx] ?? 0;
                    const fillStyle = {
                      '--karaoke-fill': `${initialPct}%`,
                      clipPath: 'inset(0 calc(100% - var(--karaoke-fill, 0%)) 0 0)',
                    } as CSSProperties;

                    return (
                      <span key={`${word.id}-${wIdx}`} className="relative inline-block">
                        <span className="text-ink/50 group-data-[state=past]:text-ink/75 group-data-[state=upcoming]:text-ink/80 select-none">
                          {word.text}
                        </span>
                        <span
                          ref={(el) => {
                            if (!wordFillRefs.current[lIdx]) {
                              wordFillRefs.current[lIdx] = [];
                            }
                            wordFillRefs.current[lIdx][wIdx] = el;
                          }}
                          aria-hidden="true"
                          className="absolute inset-0 text-acc whitespace-nowrap pointer-events-none select-none group-data-[state=past]:hidden group-data-[state=upcoming]:hidden"
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
                    key={`${line.id}-${lIdx}`}
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
                  key={`${line.id}-${lIdx}`}
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
        </div>
      </WellPanel>
    </section>
  );
});
