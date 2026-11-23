import type {
  ActiveTab,
  AudioBinary,
  ProjectFullData,
  SessionState,
} from '@/types';

const VALID_TABS: ReadonlySet<ActiveTab> = new Set<ActiveTab>([
  'sync',
  'word',
  'lyrics',
  'export',
  'catalog',
]);

/**
 * Entrada para construir un `SessionState` válido y saneado.
 */
export interface BuildSessionStateInput {
  projectId: string | null;
  activeTab?: ActiveTab;
  /** Posición de reproducción actual en milisegundos. */
  currentTime?: number;
  activeLineIndex?: number;
  activeWordIndex?: number;
  /** Marca de tiempo Unix en milisegundos. */
  updatedAt?: number;
}

/**
 * Plan de restauración validado listo para hidratar el reproductor y el motor de sincronización.
 */
export interface RestorePlan {
  projectId: string;
  project: ProjectFullData;
  audio: AudioBinary | null;
  activeTab: ActiveTab;
  /** Posición de reproducción restaurada en milisegundos. */
  currentTime: number;
  activeLineIndex: number;
  activeWordIndex: number;
  peaks: number[];
  /** Duración en segundos (compatible con `AudioBinary.duration`). */
  duration: number;
}

/**
 * Convierte una duración en segundos (p. ej. `AudioBinary.duration`) a milisegundos redondeados.
 */
export function durationSecToMs(durationSec: number): number {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }
  return Math.round(durationSec * 1000);
}

/**
 * Convierte una duración en milisegundos (p. ej. `ProjectFullData.durationMs`) a segundos.
 */
export function durationMsToSec(durationMs: number): number {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  return durationMs / 1000;
}

/**
 * Resuelve la duración del audio en segundos priorizando `AudioBinary.duration` (s)
 * y cayendo a `ProjectFullData.durationMs` convertido a segundos si el audio no tiene duración válida.
 */
export function resolveAudioDurationSec(
  audio: Pick<AudioBinary, 'duration'> | null | undefined,
  projectDurationMs: number,
): number {
  if (
    audio &&
    typeof audio.duration === 'number' &&
    Number.isFinite(audio.duration) &&
    audio.duration > 0
  ) {
    return audio.duration;
  }
  return durationMsToSec(projectDurationMs);
}

function clampIndex(value: number | undefined, maxLength: number): number {
  if (maxLength <= 0 || typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const intVal = Math.trunc(value);
  return Math.max(0, Math.min(maxLength - 1, intVal));
}

function sanitizeNonNegativeInt(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function sanitizeNonNegativeMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

/**
 * Pestañas válidas. `'loupe'` (la Lupa, eliminada) puede venir de sesiones guardadas
 * antes de quitarla: se restaura explícitamente como `'sync'` (no es un dato desconocido).
 */
function sanitizeActiveTab(tab: string | undefined): ActiveTab {
  if (tab === 'loupe') {
    return 'sync';
  }
  if (tab && VALID_TABS.has(tab as ActiveTab)) {
    return tab as ActiveTab;
  }
  return 'sync';
}

/**
 * Construye un `SessionState` saneado para persistir en el adaptador de almacenamiento.
 */
export function buildSessionState(input: BuildSessionStateInput): SessionState {
  return {
    projectId: input.projectId,
    activeTab: sanitizeActiveTab(input.activeTab),
    currentTime: sanitizeNonNegativeMs(input.currentTime),
    activeLineIndex: sanitizeNonNegativeInt(input.activeLineIndex),
    activeWordIndex: sanitizeNonNegativeInt(input.activeWordIndex),
    updatedAt:
      typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
        ? input.updatedAt
        : Date.now(),
  };
}

/**
 * Calcula el plan de restauración validando existencia del proyecto y acotando índices y tiempo.
 * Si no hay sesión, no hay `projectId`, o el proyecto no existe / no coincide, devuelve `null` sin lanzar.
 */
export function planRestore(
  session: SessionState | null,
  project: ProjectFullData | null,
  audio: AudioBinary | null,
): RestorePlan | null {
  if (!session || !session.projectId || !project || project.id !== session.projectId) {
    return null;
  }

  const lines = Array.isArray(project.lines) ? project.lines : [];
  const activeLineIndex = clampIndex(session.activeLineIndex, lines.length);
  const activeLine = lines[activeLineIndex];
  const words = activeLine && Array.isArray(activeLine.words) ? activeLine.words : [];
  const activeWordIndex = clampIndex(session.activeWordIndex, words.length);

  const duration = resolveAudioDurationSec(audio, project.durationMs);
  const maxDurationMs = durationSecToMs(duration);

  const rawTimeMs = sanitizeNonNegativeMs(session.currentTime);
  const currentTime = maxDurationMs > 0 ? Math.min(rawTimeMs, maxDurationMs) : rawTimeMs;

  const peaks =
    audio && Array.isArray(audio.peaks) && audio.peaks.length > 0
      ? audio.peaks
      : Array.isArray(project.waveformPeaks)
        ? project.waveformPeaks
        : [];

  return {
    projectId: project.id,
    project,
    audio,
    activeTab: sanitizeActiveTab(session.activeTab),
    currentTime,
    activeLineIndex,
    activeWordIndex,
    peaks,
    duration,
  };
}
