import { describe, expect, it, vi } from 'vitest';
import {
  extractPeaksAndDuration,
  importAudioFile,
  type AudioDecoderContext,
} from './audioImport';

describe('audioImport', () => {
  it('extractPeaksAndDuration calcula picos normalizados y valida duración', () => {
    const samples = new Float32Array([0, 0.5, -1, 0.25]);
    const result = extractPeaksAndDuration(
      {
        duration: 12.5,
        numberOfChannels: 1,
        getChannelData: () => samples,
      },
      4,
    );

    expect(result.duration).toBe(12.5);
    expect(result.peaks).toEqual([0, 0.5, 1, 0.25]);
  });

  it('extractPeaksAndDuration devuelve duración 0 si el valor no es finito o es negativo', () => {
    const result = extractPeaksAndDuration(
      {
        duration: Number.NaN,
        numberOfChannels: 0,
        getChannelData: () => new Float32Array(0),
      },
      3,
    );

    expect(result.duration).toBe(0);
    expect(result.peaks).toEqual([0, 0, 0]);
  });

  it('importAudioFile decodifica usando el AudioContext inyectado y cierra el contexto', async () => {
    const closeSpy = vi.fn(async () => {});
    const decodeSpy = vi.fn(async () => ({
      duration: 3.75,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array([0.2, -0.8, 0.4, 0.1]),
    }));

    const fakeContext: AudioDecoderContext = {
      decodeAudioData: decodeSpy,
      close: closeSpy,
    };

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = new File([bytes], 'cancion.mp3', { type: 'audio/mpeg' });

    const imported = await importAudioFile(file, {
      bins: 2,
      createAudioContext: () => fakeContext,
    });

    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(imported.fileName).toBe('cancion.mp3');
    expect(imported.duration).toBe(3.75);
    expect(imported.peaks).toEqual([1, 0.5]);
    expect(imported.blob).toBe(file);
  });
});
