import {
  UNSUPPORTED_AUDIO_FORMAT_MESSAGE,
  inferAudioMime,
  isSupportedAudioFile,
  needsPcmPlaybackProxy,
} from '@/lib/audioFormats';
import { computePeaks } from '@/lib/waveform';
import {
  PLAYBACK_SAMPLE_RATE,
  choosePcmLayout,
  encodeWavPcm16,
  type EncodeWavOptions,
} from '@/lib/wavEncoder';

/**
 * Cantidad estándar de barras de forma de onda extraídas al importar audio.
 */
export const DEFAULT_WAVEFORM_BINS = 240;

/**
 * Representación mínima de un `AudioBuffer` decodificado para cálculo puro de picos.
 */
export interface DecodedAudioLike {
  /** Duración total del audio decodificado en segundos (equivale a `AudioBuffer.duration`). */
  duration: number;
  numberOfChannels?: number;
  /** Tasa de muestreo del buffer en Hz (por defecto 44100 al codificar). */
  sampleRate?: number;
  getChannelData(channel: number): Float32Array;
}

/**
 * Contexto de decodificación de audio inyectable para facilitar pruebas en Node.
 */
export interface AudioDecoderContext {
  decodeAudioData(arrayBuffer: ArrayBuffer): Promise<DecodedAudioLike>;
  close?: () => Promise<void> | void;
}

/**
 * Entrada mínima compatible con `File` / `Blob` del navegador.
 */
export interface AudioFileInput {
  name?: string;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Opciones para `importAudioFile`.
 */
export interface ImportAudioOptions {
  bins?: number;
  createAudioContext?: () => AudioDecoderContext;
  /** Opciones del codificador WAV (cesión del hilo); útil en pruebas. */
  encodeOptions?: EncodeWavOptions;
}

/**
 * Resultado de importar y analizar un archivo de audio.
 * `duration` se expresa en segundos para coincidir con `AudioBuffer.duration` y `AudioBinary.duration`.
 */
export interface ImportedAudioResult {
  blob: Blob;
  fileName: string;
  peaks: number[];
  /** Duración total del audio importado en segundos. */
  duration: number;
  /**
   * WAV PCM 16 bits para reproducir con seek exacto (todo formato que no sea WAV PCM); `null` si el formato
   * se reproduce del original o si falló la preparación (ver `playbackWarning`).
   * Nunca se persiste: el blob original sigue siendo el que se guarda y exporta.
   */
  playbackBlob: Blob | null;
  /** Aviso no bloqueante si no se pudo preparar el WAV de reproducción. */
  playbackWarning: string | null;
}

/**
 * Extrae los picos normalizados y la duración válida (en segundos) de un audio decodificado.
 * @returns Picos normalizados en `[0, 1]` y `duration` en segundos (`0` si no es válida).
 */
export function extractPeaksAndDuration(
  decoded: DecodedAudioLike,
  bins = DEFAULT_WAVEFORM_BINS,
): { peaks: number[]; duration: number } {
  const duration =
    typeof decoded.duration === 'number' &&
    Number.isFinite(decoded.duration) &&
    decoded.duration > 0
      ? decoded.duration
      : 0;

  const hasChannels =
    decoded.numberOfChannels === undefined || decoded.numberOfChannels > 0;
  const channelData = hasChannels
    ? decoded.getChannelData(0)
    : new Float32Array(0);

  return {
    peaks: computePeaks(channelData, bins),
    duration,
  };
}

function resolveDefaultAudioContext(): AudioDecoderContext {
  const globalObj = globalThis as unknown as {
    OfflineAudioContext?: new (
      channels: number,
      length: number,
      sampleRate: number,
    ) => AudioDecoderContext;
    webkitOfflineAudioContext?: new (
      channels: number,
      length: number,
      sampleRate: number,
    ) => AudioDecoderContext;
    AudioContext?: new (options?: { sampleRate: number }) => AudioDecoderContext;
    webkitAudioContext?: new () => AudioDecoderContext;
  };
  // Un contexto offline a 44,1 kHz fija la tasa de decodificación (el navegador remuestrea)
  // y no depende de la política de autoplay.
  const OfflineCtor = globalObj.OfflineAudioContext ?? globalObj.webkitOfflineAudioContext;
  if (OfflineCtor) {
    return new OfflineCtor(1, 1, PLAYBACK_SAMPLE_RATE);
  }
  const Ctor = globalObj.AudioContext ?? globalObj.webkitAudioContext;
  if (!Ctor) {
    throw new Error('AudioContext no está disponible en este entorno.');
  }
  return new Ctor();
}

export const AUDIO_READ_FAILED_MESSAGE =
  'No se pudo leer el archivo de audio. Si está guardado en la nube (iCloud o Drive), verifica tu conexión o descárgalo antes de intentarlo de nuevo.';

export const AUDIO_DECODE_FAILED_MESSAGE =
  'El navegador no pudo decodificar este formato de audio. Si el archivo está dañado o no es compatible, prueba convertirlo a WAV o MP3.';

export const PLAYBACK_PREPARE_FAILED_MESSAGE =
  'No se pudo preparar el audio para saltos exactos. Se reproduce el original y los saltos pueden desfasarse unos cientos de milisegundos.';

/**
 * Codifica un audio decodificado como WAV PCM 16 bits (44,1 kHz; mono si el estéreo
 * superaría el límite de memoria) por bloques, sin congelar la UI.
 */
export async function buildPlaybackWavBlob(
  decoded: DecodedAudioLike,
  encodeOptions?: EncodeWavOptions,
): Promise<Blob> {
  const channelCount = decoded.numberOfChannels ?? 1;
  if (channelCount < 1 || !Number.isFinite(decoded.duration) || decoded.duration <= 0) {
    throw new Error('El audio decodificado está vacío.');
  }
  const sampleRate = decoded.sampleRate ?? PLAYBACK_SAMPLE_RATE;
  const layout = choosePcmLayout(decoded.duration, channelCount, sampleRate);
  const needed = layout.channels === 1 ? channelCount : Math.min(2, channelCount);
  const channels: Float32Array[] = [];
  for (let c = 0; c < needed; c++) {
    channels.push(decoded.getChannelData(c));
  }
  const buffer = await encodeWavPcm16(channels, sampleRate, layout.channels, encodeOptions);
  return new Blob([buffer], { type: 'audio/wav' });
}

async function tryBuildPlaybackBlob(
  decoded: DecodedAudioLike,
  encodeOptions?: EncodeWavOptions,
): Promise<{ blob: Blob | null; warning: string | null }> {
  try {
    return { blob: await buildPlaybackWavBlob(decoded, encodeOptions), warning: null };
  } catch (err) {
    console.warn('[audio] No se pudo preparar el WAV de reproducción.', err);
    return { blob: null, warning: PLAYBACK_PREPARE_FAILED_MESSAGE };
  }
}

export interface PlaybackBlobResult {
  /** WAV de reproducción, o `null` si no aplica o falló. */
  blob: Blob | null;
  warning: string | null;
}

/**
 * Para abrir o restaurar: decodifica cualquier formato no WAV y devuelve el WAV PCM de reproducción.
 * WAV PCM devuelve `null` sin aviso. Si la decodificación falla devuelve `null`
 * con un aviso (se usa el original).
 */
export async function decodePlaybackBlob(
  binary: Blob | ArrayBuffer,
  fileName: string,
  options: ImportAudioOptions = {},
): Promise<PlaybackBlobResult> {
  const declared = typeof Blob !== 'undefined' && binary instanceof Blob ? binary.type : undefined;
  if (!needsPcmPlaybackProxy(fileName, declared)) {
    return { blob: null, warning: null };
  }
  const { createAudioContext = resolveDefaultAudioContext, encodeOptions } = options;
  let context: AudioDecoderContext | null = null;
  try {
    const bytes = binary instanceof ArrayBuffer ? binary.slice(0) : await binary.arrayBuffer();
    context = createAudioContext();
    const decoded = await context.decodeAudioData(bytes);
    return await tryBuildPlaybackBlob(decoded, encodeOptions);
  } catch (err) {
    console.warn('[audio] No se pudo decodificar el audio para reproducción.', err);
    return { blob: null, warning: PLAYBACK_PREPARE_FAILED_MESSAGE };
  } finally {
    try {
      await context?.close?.();
    } catch {
      // Ignorar errores al cerrar el contexto de audio.
    }
  }
}

/**
 * Decodifica un archivo de audio usando `AudioContext.decodeAudioData`,
 * calcula los picos de onda con `computePeaks` y devuelve el blob y sus metadatos.
 */
export async function importAudioFile(
  file: AudioFileInput,
  options: ImportAudioOptions = {},
): Promise<ImportedAudioResult> {
  if (!isSupportedAudioFile(file)) {
    throw new Error(UNSUPPORTED_AUDIO_FORMAT_MESSAGE);
  }

  const {
    bins = DEFAULT_WAVEFORM_BINS,
    createAudioContext = resolveDefaultAudioContext,
    encodeOptions,
  } = options;

  const fileName = file.name && file.name.length > 0 ? file.name : 'audio';
  const resolvedMime = inferAudioMime(fileName, file.type);
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    throw new Error(AUDIO_READ_FAILED_MESSAGE, { cause: err });
  }
  const blob =
    typeof Blob !== 'undefined' && file instanceof Blob && file.type === resolvedMime
      ? file
      : new Blob([arrayBuffer], { type: resolvedMime });

  const context = createAudioContext();
  try {
    let decoded: DecodedAudioLike;
    try {
      decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    } catch (err) {
      throw new Error(AUDIO_DECODE_FAILED_MESSAGE, { cause: err });
    }
    const { peaks, duration } = extractPeaksAndDuration(decoded, bins);
    const playback = needsPcmPlaybackProxy(fileName, resolvedMime)
      ? await tryBuildPlaybackBlob(decoded, encodeOptions)
      : { blob: null, warning: null };

    return {
      blob,
      fileName,
      peaks,
      duration,
      playbackBlob: playback.blob,
      playbackWarning: playback.warning,
    };
  } finally {
    try {
      await context.close?.();
    } catch {
      // Ignorar errores al cerrar el contexto de audio.
    }
  }
}
