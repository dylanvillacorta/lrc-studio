import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BEEP_COUNT,
  BEEP_DURATION_S,
  BEEP_FREQUENCY_HZ,
  BEEP_INITIAL_DELAY_MS,
  BEEP_INTERVAL_MS,
  MAX_LATENCY_MS,
  clampLatencyMs,
  computeLatencyEstimateFromTaps,
  getShiftTimingsPreview,
} from '@/features/sync';
import { formatTime } from '@/lib/time';
import type { LyricLine } from '@/types';
import { AccessibleDialog, Icon, RaisedButton, ScrollShadow, WellPanel } from '@/ui';

export interface SyncSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  latencyMs: number;
  onChangeLatencyMs: (nextMs: number) => void;
  lines: readonly LyricLine[];
  durationMs: number;
  onShiftTimings: (deltaMs: number) => void;
  onUndoShift: () => boolean;
}

type TestPhase = 'idle' | 'running' | 'result';

function parseShiftDelta(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed);
}

/**
 * Diálogo accesible «Ajustes de sincronización»: calibración de latencia de audio,
 * prueba guiada con 4 pitidos Web Audio y desplazamiento global de marcas.
 */
export function SyncSettingsDialog({
  open,
  onClose,
  latencyMs,
  onChangeLatencyMs,
  lines,
  durationMs,
  onShiftTimings,
  onUndoShift,
}: SyncSettingsDialogProps) {
  const [testPhase, setTestPhase] = useState<TestPhase>('idle');
  const [tapCount, setTapCount] = useState(0);
  const [proposedLatencyMs, setProposedLatencyMs] = useState<number | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [shiftInput, setShiftInput] = useState('-200');
  const [canUndoShift, setCanUndoShift] = useState(false);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledBeepsRef = useRef<number[]>([]);
  const tapTimesRef = useRef<number[]>([]);

  const cleanupTest = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx.state !== 'closed') {
        void ctx.close().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      cleanupTest();
    }
    return cleanupTest;
  }, [cleanupTest, open]);

  const handleClose = useCallback(() => {
    cleanupTest();
    setTestPhase('idle');
    setTapCount(0);
    setProposedLatencyMs(null);
    setTestError(null);
    setCanUndoShift(false);
    setShiftNotice(null);
    onClose();
  }, [cleanupTest, onClose]);

  const handleStartBeepTest = () => {
    cleanupTest();
    setTestError(null);
    setProposedLatencyMs(null);

    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AudioCtx) {
      setTestError('Web Audio no está disponible en este navegador.');
      return;
    }

    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    void ctx.resume().catch(() => {});

    const perfNow = performance.now();
    const baseCtxTime = ctx.currentTime;
    const scheduledPerfMs: number[] = [];

    for (let i = 0; i < BEEP_COUNT; i++) {
      const offsetMs = BEEP_INITIAL_DELAY_MS + i * BEEP_INTERVAL_MS;
      const startAt = baseCtxTime + offsetMs / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(BEEP_FREQUENCY_HZ, startAt);
      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + BEEP_DURATION_S);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + BEEP_DURATION_S + 0.01);
      scheduledPerfMs.push(perfNow + offsetMs);
    }

    scheduledBeepsRef.current = scheduledPerfMs;
    tapTimesRef.current = [];
    setTapCount(0);
    setTestPhase('running');

    const totalMs =
      BEEP_INITIAL_DELAY_MS + (BEEP_COUNT - 1) * BEEP_INTERVAL_MS + 650;
    timerRef.current = setTimeout(() => {
      cleanupTest();
      const estimate = computeLatencyEstimateFromTaps(
        scheduledBeepsRef.current,
        tapTimesRef.current,
      );
      setProposedLatencyMs(estimate);
      setTestPhase('result');
    }, totalMs);
  };

  const handleTapBeep = () => {
    if (testPhase !== 'running') {
      return;
    }
    tapTimesRef.current.push(performance.now());
    setTapCount(tapTimesRef.current.length);
  };

  const handleApplyProposed = () => {
    if (proposedLatencyMs !== null) {
      onChangeLatencyMs(proposedLatencyMs);
    }
    setProposedLatencyMs(null);
    setTestPhase('idle');
  };

  const handleDiscardProposed = () => {
    setProposedLatencyMs(null);
    setTestPhase('idle');
  };

  const deltaMs = parseShiftDelta(shiftInput);
  const preview = useMemo(
    () => getShiftTimingsPreview(lines, deltaMs ?? 0, durationMs),
    [deltaMs, durationMs, lines],
  );
  const canApplyShift =
    preview.hasMarks && deltaMs !== null && deltaMs !== 0;

  const handleApplyShift = () => {
    if (!canApplyShift || deltaMs === null) {
      return;
    }
    onShiftTimings(deltaMs);
    setCanUndoShift(true);
    setShiftNotice(
      `Se desplazaron todas las marcas en ${deltaMs > 0 ? `+${deltaMs}` : deltaMs} ms.`,
    );
  };

  const handleUndoShift = () => {
    const ok = onUndoShift();
    if (ok) {
      setCanUndoShift(false);
      setShiftNotice('Se deshizo el último desplazamiento de marcas.');
    }
  };

  return (
    <AccessibleDialog
      open={open}
      onClose={handleClose}
      title="Ajustes de sincronización"
      subtitle="Latencia de salida y desplazamiento global"
      icon={<Icon name="settings" size={20} />}
      closeLabel="Cerrar ajustes de sincronización"
    >
      <ScrollShadow className="flex-1 min-h-0" contentClassName="flex flex-col gap-3 pr-0.5">
        <WellPanel className="p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-ink">
              Latencia de audio
            </span>
            <span className="font-mono text-xs font-extrabold text-acc tabular-nums">
              {latencyMs} ms
            </span>
          </div>

          <p className="m-0 text-xs font-semibold text-mute leading-relaxed">
            Se resta al instante de marcar. Con cable o altavoz suele bastar 0 ms; con
            audífonos Bluetooth suele estar entre 150 y 250 ms.
          </p>

          <input
            type="range"
            min={0}
            max={MAX_LATENCY_MS}
            step={1}
            value={latencyMs}
            onChange={(e) => onChangeLatencyMs(clampLatencyMs(Number(e.target.value)))}
            aria-label="Deslizador de latencia en milisegundos"
            className="w-full accent-acc cursor-pointer"
          />

          <div className="flex items-center gap-2">
            <RaisedButton
              size="sm"
              aria-label="Reducir latencia 10 ms"
              onClick={() => onChangeLatencyMs(clampLatencyMs(latencyMs - 10))}
              disabled={latencyMs <= 0}
              className="min-h-11 px-3 font-mono text-xs font-extrabold"
            >
              -10 ms
            </RaisedButton>

            <input
              type="number"
              min={0}
              max={MAX_LATENCY_MS}
              step={1}
              value={latencyMs}
              onChange={(e) =>
                onChangeLatencyMs(clampLatencyMs(Number(e.target.value)))
              }
              aria-label="Latencia en milisegundos"
              className="hundido flex-1 min-w-0 min-h-11 rounded-[14px] px-3 text-center font-mono text-sm font-bold text-ink bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            />

            <RaisedButton
              size="sm"
              aria-label="Aumentar latencia 10 ms"
              onClick={() => onChangeLatencyMs(clampLatencyMs(latencyMs + 10))}
              disabled={latencyMs >= MAX_LATENCY_MS}
              className="min-h-11 px-3 font-mono text-xs font-extrabold"
            >
              +10 ms
            </RaisedButton>
          </div>

          <div className="pt-1 border-t border-black/5 flex flex-col gap-2">
            {testPhase === 'idle' ? (
              <RaisedButton
                size="sm"
                onClick={handleStartBeepTest}
                className="min-h-11 w-full text-xs font-extrabold"
              >
                Probar latencia (4 pitidos)
              </RaisedButton>
            ) : null}

            {testPhase === 'running' ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onPointerDown={handleTapBeep}
                  className="boton min-h-[60px] w-full rounded-[18px] px-4 py-3 text-sm font-extrabold text-acc cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                >
                  Tocar al oír el pitido ({tapCount} / {BEEP_COUNT})
                </button>
                <RaisedButton
                  size="sm"
                  onClick={() => {
                    cleanupTest();
                    setTestPhase('idle');
                  }}
                  className="min-h-11 text-xs font-bold"
                >
                  Cancelar prueba
                </RaisedButton>
              </div>
            ) : null}

            {testPhase === 'result' ? (
              <div className="flex flex-col gap-2">
                {proposedLatencyMs !== null ? (
                  <>
                    <p className="m-0 text-xs font-bold text-ink">
                      Estimación propuesta:{' '}
                      <span className="font-mono text-acc">{proposedLatencyMs} ms</span>
                    </p>
                    <p className="m-0 text-[11px] font-semibold text-mute leading-snug">
                      Incluye tu tiempo de reacción humano; puedes afinarla con los
                      botones de ±10 ms.
                    </p>
                    <div className="flex items-center gap-2">
                      <RaisedButton
                        size="sm"
                        variant="acc"
                        onClick={handleApplyProposed}
                        className="min-h-11 flex-1 text-xs font-extrabold"
                      >
                        Aplicar {proposedLatencyMs} ms
                      </RaisedButton>
                      <RaisedButton
                        size="sm"
                        onClick={handleDiscardProposed}
                        className="min-h-11 text-xs font-bold"
                      >
                        Descartar
                      </RaisedButton>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-mute">
                      No se registraron toques válidos.
                    </span>
                    <RaisedButton
                      size="sm"
                      onClick={handleStartBeepTest}
                      className="min-h-11 text-xs font-bold"
                    >
                      Reintentar
                    </RaisedButton>
                  </div>
                )}
              </div>
            ) : null}

            {testError ? (
              <p className="m-0 text-xs font-bold text-acc">{testError}</p>
            ) : null}
          </div>
        </WellPanel>

        <WellPanel className="p-3.5 flex flex-col gap-2.5">
          <span className="text-xs font-extrabold uppercase tracking-wider text-ink">
            Desplazar todas las marcas
          </span>
          <p className="m-0 text-xs font-semibold text-mute leading-relaxed">
            Mueve las marcas ya guardadas de líneas y palabras (positivo atrasa,
            negativo adelanta).
          </p>

          <div className="flex items-center gap-2">
            <input
              type="number"
              step={10}
              value={shiftInput}
              onChange={(e) => setShiftInput(e.target.value)}
              placeholder="-200"
              aria-label="Desplazar marcas en milisegundos"
              className="hundido flex-1 min-w-0 min-h-11 rounded-[14px] px-3 font-mono text-sm font-bold text-ink bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            />
            <span className="font-mono text-xs font-bold text-mute">ms</span>
          </div>

          {preview.hasMarks &&
          preview.firstBeforeMs !== null &&
          preview.firstAfterMs !== null &&
          preview.lastBeforeMs !== null &&
          preview.lastAfterMs !== null ? (
            <div className="text-xs font-mono font-bold text-ink flex flex-col gap-0.5 bg-bg/60 rounded-[12px] px-3 py-2">
              <div className="flex justify-between gap-2">
                <span className="text-mute font-sans font-semibold">Primera marca:</span>
                <span>
                  {formatTime(preview.firstBeforeMs)} → {formatTime(preview.firstAfterMs)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-mute font-sans font-semibold">Última marca:</span>
                <span>
                  {formatTime(preview.lastBeforeMs)} → {formatTime(preview.lastAfterMs)}
                </span>
              </div>
            </div>
          ) : (
            <p className="m-0 text-xs font-semibold text-mute">
              Aún no hay marcas sincronizadas en este proyecto.
            </p>
          )}

          <div className="flex items-center gap-2">
            <RaisedButton
              size="sm"
              variant="acc"
              disabled={!canApplyShift}
              onClick={handleApplyShift}
              className="min-h-11 flex-1 text-xs font-extrabold"
            >
              Aplicar a todas las marcas
            </RaisedButton>
            {canUndoShift ? (
              <RaisedButton
                size="sm"
                onClick={handleUndoShift}
                className="min-h-11 text-xs font-bold"
              >
                Deshacer
              </RaisedButton>
            ) : null}
          </div>

          {shiftNotice ? (
            <p role="status" className="m-0 text-xs font-bold text-acc">
              {shiftNotice}
            </p>
          ) : null}
        </WellPanel>
      </ScrollShadow>
    </AccessibleDialog>
  );
}
