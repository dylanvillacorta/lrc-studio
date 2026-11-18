import { computePeaks } from '@/lib/waveform';

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
    AudioContext?: new () => AudioDecoderContext;
    webkitAudioContext?: new () => AudioDecoderContext;
  };
  const Ctor = globalObj.AudioContext ?? globalObj.webkitAudioContext;
  if (!Ctor) {
    throw new Error('AudioContext no está disponible en este entorno.');
  }
  return new Ctor();
}

/**
 * Decodifica un archivo de audio usando `AudioContext.decodeAudioData`,
 * calcula los picos de onda con `computePeaks` y devuelve el blob y sus metadatos.
 */
export async function importAudioFile(
  file: AudioFileInput,
  options: ImportAudioOptions = {},
): Promise<ImportedAudioResult> {
  const { bins = DEFAULT_WAVEFORM_BINS, createAudioContext = resolveDefaultAudioContext } =
    options;

  const arrayBuffer = await file.arrayBuffer();
  const blob =
    typeof Blob !== 'undefined' && file instanceof Blob
      ? file
      : new Blob([arrayBuffer], { type: file.type || 'audio/mpeg' });

  const context = createAudioContext();
  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const { peaks, duration } = extractPeaksAndDuration(decoded, bins);

    return {
      blob,
      fileName: file.name && file.name.length > 0 ? file.name : 'audio',
      peaks,
      duration,
    };
  } finally {
    try {
      await context.close?.();
    } catch {
      // Ignorar errores al cerrar el contexto de audio.
    }
  }
}
