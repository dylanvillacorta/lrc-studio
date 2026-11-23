import {
  INSPECTOR_STEPS_MS,
  applyInspectorDelta,
  type LineBounds,
} from '@/features/sync/model/inspectorBounds';
import { formatTime } from '@/lib/time';
import { WellPanel } from '@/ui';

export interface InspectorPanelProps {
  startMs: number;
  endMs: number;
  durationMs: number;
  onChange: (bounds: LineBounds) => void;
  className?: string;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

function formatStepLabel(deltaMs: number): string {
  return deltaMs < 0 ? `−${Math.abs(deltaMs)}` : `+${deltaMs}`;
}

/**
 * Inspector numérico de precisión con pasos de −50, −10, +10 y +50 ms
 * para ajustar inicio y fin de la línea con objetivos táctiles de 48 px.
 */
export function InspectorPanel({
  startMs,
  endMs,
  durationMs,
  onChange,
  className = '',
}: InspectorPanelProps) {
  const handleStep = (field: 'start' | 'end', deltaMs: number) => {
    onChange(
      applyInspectorDelta({ startMs, endMs }, field, deltaMs, durationMs),
    );
  };

  return (
    <WellPanel className={`p-3.5 flex flex-col gap-3 ${className}`.trim()}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs font-extrabold tracking-[0.08em] text-mute">
          <span>INICIO</span>
          <span className="font-mono text-[15px] font-bold text-ink tabular-nums">
            {formatTime(startMs)}
          </span>
        </div>
        <div className="flex gap-2">
          {INSPECTOR_STEPS_MS.map((step) => {
            const label = formatStepLabel(step);
            return (
              <button
                key={`start-${step}`}
                type="button"
                aria-label={`Ajustar inicio ${label} ms`}
                onClick={() => handleStep('start', step)}
                className={`flex-1 min-h-12 min-w-12 rounded-[14px] font-mono font-bold text-sm bg-bg text-ink shadow-[var(--shadow-boton)] cursor-pointer transition-transform active:scale-[0.97] ${FOCUS_RING}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs font-extrabold tracking-[0.08em] text-mute">
          <span>FIN</span>
          <span className="font-mono text-[15px] font-bold text-ink tabular-nums">
            {formatTime(endMs)}
          </span>
        </div>
        <div className="flex gap-2">
          {INSPECTOR_STEPS_MS.map((step) => {
            const label = formatStepLabel(step);
            return (
              <button
                key={`end-${step}`}
                type="button"
                aria-label={`Ajustar fin ${label} ms`}
                onClick={() => handleStep('end', step)}
                className={`flex-1 min-h-12 min-w-12 rounded-[14px] font-mono font-bold text-sm bg-bg text-ink shadow-[var(--shadow-boton)] cursor-pointer transition-transform active:scale-[0.97] ${FOCUS_RING}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </WellPanel>
  );
}
