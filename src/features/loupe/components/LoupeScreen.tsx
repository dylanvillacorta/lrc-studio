import { useCallback, useMemo, useState } from 'react';
import {
  computeZoomWindow,
  normalizeLineBounds,
  type LineBounds,
  type ZoomWindow,
  type ZoomWindowOptions,
} from '@/features/loupe/model/loupeModel';
import type { LyricLine } from '@/types';
import { Icon, IconButton, Pill, RaisedButton } from '@/ui';
import { InspectorPanel } from './InspectorPanel';
import { LoupeView } from './LoupeView';
import { WaveformOverview } from './WaveformOverview';

export interface LoupeScreenProps {
  peaks: readonly number[];
  durationMs: number;
  currentTimeMs: number;
  line: LyricLine;
  lineIndex: number;
  lines: readonly LyricLine[];
  isSaved?: boolean;
  zoomOptions?: ZoomWindowOptions;
  snapStepMs?: number;
  onChange: (bounds: LineBounds) => void;
  onPlayLine: () => void;
  onApply: (bounds: LineBounds) => void;
  onBack?: () => void;
  className?: string;
}

/**
 * Pantalla de ajuste fino (Lupa e inspector de milisegundos) dirigida por props.
 * Permite arrastrar los bordes de una línea, ajustar ±10/±50 ms, escuchar la
 * línea (con Pre-Roll y Post-Roll) y aplicar los cambios.
 */
export function LoupeScreen({
  peaks,
  durationMs,
  currentTimeMs,
  line,
  lineIndex,
  lines,
  isSaved = true,
  zoomOptions,
  snapStepMs,
  onChange,
  onPlayLine,
  onApply,
  onBack,
  className = '',
}: LoupeScreenProps) {
  const bounds = useMemo(
    () => normalizeLineBounds(line, durationMs),
    [line, durationMs],
  );

  const liveZoomWindow = useMemo(
    () =>
      computeZoomWindow(
        { startMs: bounds.startMs, endMs: bounds.endMs },
        durationMs,
        zoomOptions,
      ),
    [bounds.endMs, bounds.startMs, durationMs, zoomOptions],
  );

  // Durante el arrastre de un borde la ventana de zoom se congela: si se recalculara con los
  // bordes actuales, la escala se desplazaría bajo el dedo y el borde se escaparía.
  const [frozenWindow, setFrozenWindow] = useState<ZoomWindow | null>(null);
  const handleDragStateChange = useCallback(
    (dragging: boolean) => {
      setFrozenWindow(dragging ? liveZoomWindow : null);
    },
    [liveZoomWindow],
  );
  const zoomWindow = useMemo<ZoomWindow>(
    () =>
      frozenWindow
        ? { ...frozenWindow, lineStartMs: bounds.startMs, lineEndMs: bounds.endMs }
        : liveZoomWindow,
    [bounds.endMs, bounds.startMs, frozenWindow, liveZoomWindow],
  );

  return (
    <section
      aria-label={`Ajuste fino de la línea ${lineIndex + 1}`}
      className={`flex flex-col gap-3 bg-bg text-ink ${className}`.trim()}
    >
      <header className="flex items-center gap-2.5 min-w-0">
        {onBack ? (
          <IconButton aria-label="Volver" onClick={onBack}>
            <Icon name="back" size={20} />
          </IconButton>
        ) : null}
        <div className="flex-1 min-w-0">
          <h2 className="m-0 text-base font-extrabold tracking-tight truncate">
            {`Ajuste fino · Línea ${lineIndex + 1}`}
          </h2>
          <p className="m-0 text-xs font-semibold text-mute truncate">
            {`«${line.text}»`}
          </p>
        </div>
        <Pill variant={isSaved ? 'ok' : 'mute'}>
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full ${isSaved ? 'bg-ok' : 'bg-mute'}`}
          />
          {isSaved ? 'Guardado' : 'Editando'}
        </Pill>
      </header>

      <WaveformOverview
        peaks={peaks}
        durationMs={durationMs}
        currentTimeMs={currentTimeMs}
        lines={lines}
        zoomWindow={zoomWindow}
      />

      <LoupeView
        peaks={peaks}
        durationMs={durationMs}
        currentTimeMs={currentTimeMs}
        zoomWindow={zoomWindow}
        onChange={onChange}
        onDragStateChange={handleDragStateChange}
        snapStepMs={snapStepMs}
      />

      <InspectorPanel
        startMs={bounds.startMs}
        endMs={bounds.endMs}
        durationMs={durationMs}
        onChange={onChange}
      />

      <div className="flex gap-3 pt-0.5">
        <RaisedButton
          onClick={onPlayLine}
          className="flex-1 text-acc"
        >
          <Icon name="play" size={18} />
          <span>Escuchar línea</span>
        </RaisedButton>

        <RaisedButton
          variant="acc"
          onClick={() => onApply(bounds)}
          className="flex-1"
        >
          <Icon name="check" size={18} />
          <span>Aplicar</span>
        </RaisedButton>
      </div>
    </section>
  );
}
