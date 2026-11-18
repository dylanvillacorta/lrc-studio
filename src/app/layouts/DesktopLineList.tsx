import { useEffect, useRef } from 'react';
import { formatDisplayTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { WellPanel } from '@/ui';

export interface DesktopLineListProps {
  lines: readonly LyricLine[];
  activeLineIndex: number;
  playingLineIndex?: number;
  trackedListIndex?: number;
  onSelectLine: (index: number) => void;
}

/**
 * Lista scrollable de líneas de letra para seleccionar y visualizar marcas en escritorio.
 */
export function DesktopLineList({
  lines,
  activeLineIndex,
  playingLineIndex = -1,
  trackedListIndex = activeLineIndex,
  onSelectLine,
}: DesktopLineListProps) {
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

  return (
    <WellPanel
      ref={listRef}
      data-testid="desktop-line-list"
      className="flex-1 min-h-[180px] p-2.5 overflow-y-auto flex flex-col gap-1.5"
    >
      {lines.length > 0 ? (
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
              className={`w-full min-h-12 px-3.5 py-2.5 rounded-[14px] flex items-center justify-between gap-2.5 text-left transition-shadow motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
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
              <span className="truncate text-[14.5px] flex-1 min-w-0">
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
          Aún no hay letra cargada. Usa «Letra» arriba para agregar líneas.
        </div>
      )}
    </WellPanel>
  );
}
