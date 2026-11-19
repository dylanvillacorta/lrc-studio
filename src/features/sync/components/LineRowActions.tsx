import { memo, useEffect, useRef, useState } from 'react';
import {
  formatEditableTimestamp,
  nudgeTimestampDraft,
  validateLineTimeInput,
} from '@/features/sync/model/lineTimeEdit';
import { Icon, IconButton, RaisedButton } from '@/ui';

export interface LineRowActionBarProps {
  isSynced: boolean;
  onPlayFromHere?: () => void;
  onClearMark?: () => void;
}

/**
 * Barra compacta de acciones para la línea seleccionada (objetivos ≥ 44 px, sin crecer la fila).
 */
export const LineRowActionBar = memo(function LineRowActionBar({
  isSynced,
  onPlayFromHere,
  onClearMark,
}: LineRowActionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Acciones de línea"
      className="flex items-center gap-1 shrink-0"
    >
      {isSynced && onPlayFromHere ? (
        <IconButton
          aria-label="Reproducir desde aquí"
          onClick={onPlayFromHere}
          className="min-h-11 min-w-11 h-11 w-11 rounded-[10px] text-acc shrink-0"
        >
          <Icon name="play" size={16} />
        </IconButton>
      ) : null}

      {isSynced && onClearMark ? (
        <IconButton
          aria-label="Borrar marca"
          onClick={onClearMark}
          className="min-h-11 min-w-11 h-11 w-11 rounded-[10px] text-ink shrink-0"
        >
          <Icon name="trash" size={16} />
        </IconButton>
      ) : null}
    </div>
  );
});

export interface LineTimeEditorProps {
  lineIndex: number;
  initialStartMs: number | null;
  prevLineStartMs: number | null;
  durationMs: number;
  onAccept: (lineIndex: number, startMs: number) => void;
  onCancel: () => void;
}

const NUDGE_STEPS = [
  { delta: -50, label: '−50', aria: 'Restar 50 milisegundos' },
  { delta: -10, label: '−10', aria: 'Restar 10 milisegundos' },
  { delta: 10, label: '+10', aria: 'Sumar 10 milisegundos' },
  { delta: 50, label: '+50', aria: 'Sumar 50 milisegundos' },
] as const;

/**
 * Editor compacto en línea para ajustar manualmente `startMs` (`mm:ss.cc` / `mm:ss.ccc`)
 * con botones de ±10 y ±50 ms, validación en español y soporte de Enter/Esc.
 */
export const LineTimeEditor = memo(function LineTimeEditor({
  lineIndex,
  initialStartMs,
  prevLineStartMs,
  durationMs,
  onAccept,
  onCancel,
}: LineTimeEditorProps) {
  const [draft, setDraft] = useState(() => formatEditableTimestamp(initialStartMs));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(() => {
    const check = validateLineTimeInput(
      formatEditableTimestamp(initialStartMs),
      durationMs,
      prevLineStartMs,
    );
    return check.ok ? check.warning : null;
  });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [lineIndex]);

  const updateDraftAndValidate = (nextDraft: string) => {
    setDraft(nextDraft);
    const check = validateLineTimeInput(nextDraft, durationMs, prevLineStartMs);
    if (check.ok) {
      setError(null);
      setWarning(check.warning);
    } else {
      setWarning(null);
    }
  };

  const handleNudge = (deltaMs: number) => {
    const nextDraft = nudgeTimestampDraft(
      draft,
      deltaMs,
      durationMs,
      initialStartMs ?? 0,
    );
    updateDraftAndValidate(nextDraft);
  };

  const handleAccept = () => {
    const res = validateLineTimeInput(draft, durationMs, prevLineStartMs);
    if (!res.ok) {
      setError(res.error);
      setWarning(null);
      return;
    }
    onAccept(lineIndex, res.ms);
  };

  return (
    <div
      role="region"
      aria-label={`Editar tiempo de línea ${lineIndex + 1}`}
      className="relieve rounded-[14px] p-2 flex flex-col gap-1.5 flex-none"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-extrabold text-ink shrink-0">
          {`Línea ${lineIndex + 1}`}
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          aria-label="Editar tiempo de línea"
          value={draft}
          onChange={(e) => updateDraftAndValidate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAccept();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder="mm:ss.cc"
          className="hundido min-h-11 w-[11ch] px-2.5 rounded-[10px] font-mono text-sm font-bold tabular-nums text-ink bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        />
        <div className="flex items-center gap-1 flex-wrap">
          {NUDGE_STEPS.map((step) => (
            <RaisedButton
              key={step.delta}
              size="sm"
              aria-label={step.aria}
              onClick={() => handleNudge(step.delta)}
              className="min-h-11 min-w-11 px-2 font-mono text-xs font-bold"
            >
              {step.label}
            </RaisedButton>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <RaisedButton
            size="sm"
            variant="acc"
            aria-label="Aceptar tiempo"
            onClick={handleAccept}
            className="min-h-11 px-3 text-xs font-extrabold"
          >
            Aceptar
          </RaisedButton>
          <RaisedButton
            size="sm"
            aria-label="Cancelar edición"
            onClick={onCancel}
            className="min-h-11 px-3 text-xs font-bold"
          >
            Cancelar
          </RaisedButton>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-bold text-acc px-1">
          {error}
        </p>
      ) : warning ? (
        <p role="status" className="text-xs font-semibold text-warn px-1">
          {warning}
        </p>
      ) : null}
    </div>
  );
});
