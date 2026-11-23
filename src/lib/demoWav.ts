/**
 * Generador de audio WAV sintetizado en memoria para demostración.
 * Origen en el archivo base (`docs/base/lyricsync_studio_pro_2_00.tsx`):
 * `createSynthesizedDemoWav` (línea 63).
 */

import { writeWavHeader } from '@/lib/wavEncoder';

export interface SynthesizedDemoWav {
  url: string | null;
  blob: Blob;
  buffer: ArrayBuffer;
  peaks: number[];
  durationMs: number;
}

const DEMO_SAMPLE_RATE = 22_050;
const DEMO_PEAK_BINS = 240;

const CHORDS: readonly (readonly [number, number, number])[] = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [130.81, 164.81, 196.0], // C
  [196.0, 246.94, 293.66], // G
];

const MELODY_NOTES: readonly number[] = [
  329.63, 392.0, 440.0, 392.0, 349.23, 329.63, 293.66, 261.63,
];

/**
 * Genera un archivo WAV PCM mono de 16 bits en memoria con progresión de acordes y pulso rítmico.
 * Devuelve la duración en milisegundos (`durationMs`), los 240 picos normalizados,
 * el `Blob`, el `ArrayBuffer` y una `ObjectURL` si el entorno soporta `URL.createObjectURL`.
 */
export function createSynthesizedDemoWav(durationSeconds = 28): SynthesizedDemoWav {
  const safeSeconds = Math.max(1, Math.floor(durationSeconds));
  const numSamples = safeSeconds * DEMO_SAMPLE_RATE;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  writeWavHeader(view, {
    sampleRate: DEMO_SAMPLE_RATE,
    channels: 1,
    bitsPerSample: 16,
    dataBytes: numSamples * 2,
  });

  const peaks: number[] = [];
  const samplesPerBin = Math.max(1, Math.floor(numSamples / DEMO_PEAK_BINS));
  let currentBinMax = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / DEMO_SAMPLE_RATE;
    const beatIndex = Math.floor(t * 2);
    const beatPhase = (t * 2) % 1;
    const chord = CHORDS[Math.floor(t / 4) % CHORDS.length] ?? CHORDS[0]!;

    const pad =
      (Math.sin(2 * Math.PI * chord[0] * t) +
        Math.sin(2 * Math.PI * chord[1] * t) +
        Math.sin(2 * Math.PI * chord[2] * t)) /
      3;

    const noteFreq = MELODY_NOTES[beatIndex % MELODY_NOTES.length] ?? 329.63;
    const noteEnv = Math.exp(-beatPhase * 4.5);
    const lead = Math.sin(2 * Math.PI * noteFreq * t) * noteEnv * 0.45;

    const kickEnv = Math.exp(-beatPhase * 18);
    const kick = Math.sin(2 * Math.PI * (90 - beatPhase * 45) * t) * kickEnv * 0.4;

    const sample = Math.max(-0.95, Math.min(0.95, pad * 0.3 + lead + kick));
    const absVal = Math.abs(sample);
    if (absVal > currentBinMax) {
      currentBinMax = absVal;
    }

    if (i > 0 && i % samplesPerBin === 0 && peaks.length < DEMO_PEAK_BINS) {
      peaks.push(Math.min(1, currentBinMax * 1.15));
      currentBinMax = 0;
    }

    view.setInt16(44 + i * 2, sample * 32_767, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : null;

  return {
    url,
    blob,
    buffer,
    peaks,
    durationMs: safeSeconds * 1000,
  };
}
