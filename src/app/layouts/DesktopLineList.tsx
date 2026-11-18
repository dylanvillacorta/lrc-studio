import { formatDisplayTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { WellPanel } from '@/ui';

export interface DesktopLineListProps {
  lines: readonly LyricLine[];
  activeLineIndex: number;
  onSelectLine: (index: number) => void;
}

/**
 * Lista scrollable de líneas de letra para seleccionar y visualizar marcas en escritorio.
 */
export function DesktopLineList({
  lines,
  activeLineIndex,
  onSelectLine,
}: DesktopLineListProps) {
  return (
    <WellPanel className="flex-1 min-h-[180px] p-2.5 overflow-y-auto flex flex-col gap-1.5">
      {lines.length > 0 ? (
        lines.map((line, index) => {
          const isCurrent = index === activeLineIndex;
          const isSynced = line.startMs !== null;
          return (
            <button
              key={line.id}
              type="button"
              onClick={() => onSelectLine(index)}
              aria-current={isCurrent ? 'true' : undefined}
              className={`w-full min-h-12 px-3.5 py-2.5 rounded-[14px] flex items-center justify-between gap-2.5 text-left transition-shadow motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                isCurrent
                  ? 'relieve text-ink font-extrabold'
                  : isSynced
                    ? 'bg-transparent text-ink font-semibold'
                    : 'bg-transparent text-mute font-semibold'
              }`}
            >
              <span className="truncate text-[14.5px] flex-1 min-w-0">
                {line.text}
              </span>
              <span
                className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                  isCurrent
                    ? 'text-acc'
                    : isSynced
                      ? 'text-ok'
                      : 'text-mute/75'
                }`}
              >
                {isCurrent && !isSynced
                  ? 'esperando marca'
                  : formatDisplayTime(line.startMs)}
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
