/**
 * Codificador WAV PCM de 16 bits en memoria, puro y sin dependencias.
 * Se usa para reproducir formatos comprimidos (FLAC, MP3, AAC...) desde un contenedor con seek exacto al muestreo.
 */

/** Tasa de muestreo fija del proxy de reproducción (acota la memoria y evita remuestreos del navegador). */
export const PLAYBACK_SAMPLE_RATE = 44_100;

/** Umbral de PCM estéreo (bytes) a partir del cual se mezcla a mono para acotar memoria. */
export const STEREO_PCM_BYTE_LIMIT = 64 * 1024 * 1024;

const WAV_HEADER_BYTES = 44;
const DEFAULT_BLOCK_FRAMES = 16_384;
const DEFAULT_SLICE_BUDGET_MS = 8;

export interface WavHeaderOptions {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
}

export interface PcmLayout {
  /** Canales de salida: 1 (mono) o 2 (estéreo). */
  channels: 1 | 2;
  sampleRate: number;
  /** `true` si se mezcló a mono para respetar el límite de memoria. */
  downmixed: boolean;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * Escribe la cabecera RIFF/WAVE canónica (44 bytes) al inicio de `view`.
 */
export function writeWavHeader(view: DataView, options: WavHeaderOptions): void {
  const { sampleRate, channels, bitsPerSample, dataBytes } = options;
  const blockAlign = channels * (bitsPerSample / 8);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
}

/**
 * Decide estéreo o mono: estéreo solo si el PCM de 16 bits cabe en el límite de memoria.
 */
export function choosePcmLayout(
  durationSec: number,
  channelCount: number,
  sampleRate: number = PLAYBACK_SAMPLE_RATE,
  stereoByteLimit: number = STEREO_PCM_BYTE_LIMIT,
): PcmLayout {
  if (channelCount <= 1) {
    return { channels: 1, sampleRate, downmixed: false };
  }
  const stereoBytes = Math.max(0, durationSec) * sampleRate * 2 * 2;
  if (stereoBytes > stereoByteLimit) {
    return { channels: 1, sampleRate, downmixed: true };
  }
  return { channels: 2, sampleRate, downmixed: false };
}

/** Float32 [-1, 1] a Int16 con recorte. */
export function floatToInt16(value: number): number {
  const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
  return clamped < 0 ? Math.round(clamped * 32_768) : Math.round(clamped * 32_767);
}

export interface EncodeWavOptions {
  /** Cede el hilo entre bloques; por defecto `setTimeout(0)`. */
  yieldToMain?: () => Promise<void>;
  /** Tiempo máximo de trabajo continuo por bloque (ms). */
  sliceBudgetMs?: number;
  blockFrames?: number;
  now?: () => number;
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sampleAt(
  channels: readonly Float32Array[],
  layoutChannels: 1 | 2,
  channelIndex: number,
  frame: number,
): number {
  if (layoutChannels === 1 && channels.length > 1) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) {
      sum += channels[c]![frame] ?? 0;
    }
    return sum / channels.length;
  }
  const source = channels[Math.min(channelIndex, channels.length - 1)];
  return source?.[frame] ?? 0;
}

/**
 * Codifica canales Float32 a un WAV PCM de 16 bits por bloques, cediendo el hilo
 * para no congelar la UI. `layoutChannels` 1 mezcla (promedio) todos los canales.
 */
export async function encodeWavPcm16(
  channels: readonly Float32Array[],
  sampleRate: number,
  layoutChannels: 1 | 2 = channels.length > 1 ? 2 : 1,
  options: EncodeWavOptions = {},
): Promise<ArrayBuffer> {
  if (channels.length === 0) {
    throw new Error('No hay canales de audio para codificar.');
  }
  const {
    yieldToMain = defaultYield,
    sliceBudgetMs = DEFAULT_SLICE_BUDGET_MS,
    blockFrames = DEFAULT_BLOCK_FRAMES,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  } = options;

  const frames = channels[0]!.length;
  const dataBytes = frames * layoutChannels * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writeWavHeader(view, { sampleRate, channels: layoutChannels, bitsPerSample: 16, dataBytes });

  let sliceStart = now();
  let offset = WAV_HEADER_BYTES;
  for (let start = 0; start < frames; start += blockFrames) {
    const end = Math.min(frames, start + blockFrames);
    for (let frame = start; frame < end; frame++) {
      for (let c = 0; c < layoutChannels; c++) {
        view.setInt16(offset, floatToInt16(sampleAt(channels, layoutChannels, c, frame)), true);
        offset += 2;
      }
    }
    if (end < frames && now() - sliceStart >= sliceBudgetMs) {
      await yieldToMain();
      sliceStart = now();
    }
  }
  return buffer;
}
