import { memo } from 'react';
import { InspectorPanel, type LineBounds } from '@/features/sync';
import { Keycap, WellPanel } from '@/ui';

export interface DesktopInspectorSidebarProps {
  targetLabel: string | null;
  startMs: number | null;
  endMs: number | null;
  durationMs: number;
  onChangeBounds: (bounds: LineBounds) => void;
}

/**
 * Columna derecha de escritorio con el Inspector de ±10 y ±50 ms
 * y la leyenda de atajos de teclado con `Keycap`.
 */
export const DesktopInspectorSidebar = memo(function DesktopInspectorSidebar({
  targetLabel,
  startMs,
  endMs,
  durationMs,
  onChangeBounds,
}: DesktopInspectorSidebarProps) {
  const safeStart = startMs ?? 0;
  const safeEnd = endMs ?? Math.max(safeStart, safeStart + 500);

  return (
    <aside
      aria-label="Inspector y atajos de teclado"
      className="min-[1100px]:w-[320px] min-[1100px]:flex-none flex flex-col gap-5 min-w-0"
    >
      <section
        aria-label="Inspector de tiempos"
        className="relieve rounded-[26px] p-[18px] flex flex-col gap-3"
      >
        <h2 className="m-0 text-[15px] font-extrabold text-ink">
          Inspector
        </h2>

        {targetLabel ? (
          <p className="m-0 text-xs font-bold text-mute truncate">
            {targetLabel}
          </p>
        ) : null}

        {startMs !== null ? (
          <InspectorPanel
            startMs={safeStart}
            endMs={safeEnd}
            durationMs={durationMs}
            onChange={onChangeBounds}
          />
        ) : (
          <WellPanel className="p-3.5 text-xs font-semibold text-mute">
            Marca una línea o palabra para ajustar sus tiempos en ±10 y ±50 ms.
          </WellPanel>
        )}
      </section>

      <section
        aria-label="Atajos de teclado"
        className="relieve rounded-[26px] p-[18px] flex-1 flex flex-col gap-3"
      >
        <h2 className="m-0 text-[15px] font-extrabold text-ink">
          Atajos de teclado
        </h2>

        <ul className="m-0 p-0 list-none flex flex-col gap-2.5 text-sm">
          <li className="flex items-center gap-2.5">
            <Keycap>Espacio</Keycap>
            <span className="font-semibold text-ink">
              Marcar línea / palabra
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <Keycap>R</Keycap>
            <span className="font-semibold text-ink">Repetir Pre-Roll</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Keycap>P</Keycap>
            <span className="font-semibold text-ink">Reproducir / pausar</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5">
              <Keycap>←</Keycap>
              <Keycap>→</Keycap>
            </span>
            <span className="font-semibold text-ink">Ajustar ±50 ms</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5">
              <Keycap>[</Keycap>
              <Keycap>]</Keycap>
            </span>
            <span className="font-semibold text-ink">Ajustar ±10 ms</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5">
              <Keycap>Z</Keycap>
              <Keycap>Ctrl+Z</Keycap>
            </span>
            <span className="font-semibold text-ink">Deshacer marca</span>
          </li>
        </ul>
      </section>
    </aside>
  );
});
