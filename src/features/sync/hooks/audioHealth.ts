/**
 * Lógica pura de salud del elemento Audio (T26): decide si puede reproducir o si
 * hay que reparar (releer bytes, recrear Blob/ObjectURL y recargar).
 */

/** Motivo por el que el audio se considera no sano. */
export type AudioUnhealthyReason =
  | 'no-source'
  | 'src-mismatch'
  | 'project-mismatch'
  | 'error'
  | 'emptied'
  | 'stalled'
  | 'invalid-url'
  | 'bfcache'
  | 'frozen'
  | 'network-empty';

/** Marcas que se activan por eventos y persisten hasta una reparación. */
export type AudioHealthFlag = Extract<
  AudioUnhealthyReason,
  'emptied' | 'stalled' | 'invalid-url' | 'bfcache' | 'frozen'
>;

export interface AudioHealthInput {
  /** Blob URL vigente que debería estar cargado. */
  expectedSrc: string | null;
  /** `src` que realmente tiene el elemento. */
  currentSrc: string | null;
  expectedProjectId: string | null;
  elementProjectId: string | null;
  readyState: number;
  networkState: number;
  hasError: boolean;
  flag: AudioHealthFlag | null;
}

export interface AudioHealth {
  healthy: boolean;
  reason: AudioUnhealthyReason | null;
}

const NETWORK_NO_SOURCE = 3;
const NETWORK_EMPTY = 0;
const HAVE_METADATA = 1;

/**
 * Un elemento está sano si tiene el `src` vigente del proyecto vigente, sin error,
 * sin marcas de `emptied`/`stalled`/URL inválida/bfcache y, o bien ya tiene
 * metadatos, o bien puede cargar (red en reposo o cargando).
 */
export function assessAudioHealth(input: AudioHealthInput): AudioHealth {
  const bad = (reason: AudioUnhealthyReason): AudioHealth => ({
    healthy: false,
    reason,
  });
  if (!input.expectedSrc) return bad('no-source');
  if (input.currentSrc !== input.expectedSrc) return bad('src-mismatch');
  if (
    input.expectedProjectId !== null &&
    input.elementProjectId !== null &&
    input.expectedProjectId !== input.elementProjectId
  ) {
    return bad('project-mismatch');
  }
  if (input.hasError) return bad('error');
  if (input.flag) return bad(input.flag);
  if (input.readyState >= HAVE_METADATA) return { healthy: true, reason: null };
  if (
    input.networkState === NETWORK_NO_SOURCE ||
    input.networkState === NETWORK_EMPTY
  ) {
    return bad('network-empty');
  }
  return { healthy: true, reason: null };
}

/** Hay algo que reparar solo si el audio no está sano, existe fuente y no hay reparación en curso. */
export function shouldRepairAudio(
  health: AudioHealth,
  state: { repairing: boolean; canRepair: boolean },
): boolean {
  if (health.healthy || state.repairing || !state.canRepair) return false;
  return health.reason !== 'no-source';
}

/** `pageshow` marca no sano solo cuando la página viene de bfcache. */
export function flagForPageShow(persisted: boolean): AudioHealthFlag | null {
  return persisted ? 'bfcache' : null;
}

/**
 * `stalled` es normal durante una carga inicial: solo marca si el elemento aún
 * no tiene datos suficientes para reproducir.
 */
export function flagForStalled(readyState: number): AudioHealthFlag | null {
  return readyState < 2 ? 'stalled' : null;
}

export type PlaybackProgressVerdict = 'advancing' | 'frozen' | 'inconclusive';

export interface PlaybackProgressInput {
  prevTimeSec: number;
  currTimeSec: number;
  /** Tiempo real transcurrido entre ambas lecturas (reloj real, no eventos). */
  elapsedMs: number;
  playbackRate: number;
  /** Fracción mínima del avance esperado para considerar que reproduce. */
  minFraction?: number;
  /** Ventana mínima para poder opinar. */
  minElapsedMs?: number;
}

/**
 * Vigilante de progreso (T26): en iOS el elemento puede decir `paused === false`
 * con `readyState` alto y no avanzar ni sonar. Compara `currentTime` con el reloj real.
 * Los saltos (seek hacia atrás o hacia adelante) y las ventanas cortas son no concluyentes.
 */
export function evaluatePlaybackProgress(
  input: PlaybackProgressInput,
): PlaybackProgressVerdict {
  const { prevTimeSec, currTimeSec, elapsedMs, playbackRate } = input;
  const minFraction = input.minFraction ?? 0.25;
  const minElapsedMs = input.minElapsedMs ?? 300;
  if (
    !Number.isFinite(prevTimeSec) ||
    !Number.isFinite(currTimeSec) ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < minElapsedMs
  ) {
    return 'inconclusive';
  }
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const expectedSec = (elapsedMs / 1000) * rate;
  const delta = currTimeSec - prevTimeSec;
  if (delta < 0 || delta > expectedSec * 3 + 1) {
    return 'inconclusive';
  }
  return delta >= expectedSec * minFraction ? 'advancing' : 'frozen';
}
