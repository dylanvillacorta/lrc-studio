import { memo, useRef } from 'react';
import { LineRowActionBar } from '@/features/sync/components/LineRowActions';
import { useCenteredListScroll } from '@/features/sync/hooks/useCenteredListScroll';
import { formatDisplayTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { WellPanel } from '@/ui';

export interface DesktopLineListProps {
  lines: readonly LyricLine[];
  activeLineIndex: number;
  playingLineIndex?: number;
  trackedListIndex?: number;
  autoCenter?: boolean;
  onSelectLine: (index: number) => void;
  onPlayFromLine?: (index: number) => void;
  onClearLineMark?: (index: number) => void;
}

/**
 * Lista scrollable de líneas de letra para seleccionar y visualizar marcas en escritorio.
 */
export const DesktopLineList = memo(function DesktopLineList({
  lines,
  activeLineIndex,
  playingLineIndex = -1,
  trackedListIndex = activeLineIndex,
  autoCenter = true,
  onSelectLine,
  onPlayFromLine,
  onClearLineMark,
}: DesktopLineListProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const lineRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useCenteredListScroll({
    containerRef: listRef,
    itemRefs: lineRowRefs,
    targetIndex: trackedListIndex,
    enabled: autoCenter && lines.length > 0,
    itemCount: lines.length,
  });

  return (
    <div className="flex-1 min-h-[180px] max-h-[max(240px,calc(100dvh-430px))] flex flex-col gap-2">
      <WellPanel
        ref={listRef}
        data-testid="desktop-line-list"
        className="flex-1 min-h-0 p-2.5 overflow-y-auto flex flex-col gap-1.5"
      >
        {lines.length > 0 ? (
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
                className={`w-full min-h-12 rounded-[14px] flex items-center gap-2 transition-shadow motion-reduce:transition-none ${
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
                  className={`flex-1 min-w-0 min-h-12 px-3.5 py-2.5 rounded-[14px] flex items-center justify-between gap-2.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                    isCurrent
                      ? 'text-ink font-extrabold'
                      : isPlayingLine
                        ? 'text-ink font-bold'
                        : isSynced
                          ? 'text-ink font-semibold'
                          : 'text-mute font-semibold'
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
                {isCurrent ? (
                  <div className="pr-1.5 shrink-0">
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
            Aún no hay letra cargada. Usa «Letra» arriba para agregar líneas.
          </div>
        )}
      </WellPanel>
    </div>
  );
});
