import { describe, expect, it, vi } from 'vitest';
import {
  AUDIO_DECODE_FAILED_MESSAGE,
  extractPeaksAndDuration,
  importAudioFile,
  type AudioDecoderContext,
} from './audioImport';
import { UNSUPPORTED_AUDIO_FORMAT_MESSAGE } from './audioFormats';

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

  it('importAudioFile conserva bytes de FLAC y normaliza MIME audio/x-flac o vacío a audio/flac', async () => {
    const flacBytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0x00, 0x00, 0x22]);
    const fakeContext: AudioDecoderContext = {
      decodeAudioData: vi.fn(async () => ({
        duration: 1.0,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array([0.5, -0.5]),
      })),
      close: vi.fn(async () => {}),
    };

    const file = new File([flacBytes], 'master.FLAC', { type: 'audio/x-flac' });
    const imported = await importAudioFile(file, {
      bins: 2,
      createAudioContext: () => fakeContext,
    });

    expect(imported.blob.type).toBe('audio/flac');
    expect(new Uint8Array(await imported.blob.arrayBuffer())).toEqual(flacBytes);
  });

  it('importAudioFile rechaza archivos no soportados antes de abrir AudioContext', async () => {
    const createCtxSpy = vi.fn();
    const txtFile = new File([new Uint8Array([65, 66])], 'notas.txt', { type: 'text/plain' });

    await expect(
      importAudioFile(txtFile, { createAudioContext: createCtxSpy }),
    ).rejects.toThrow(UNSUPPORTED_AUDIO_FORMAT_MESSAGE);
    expect(createCtxSpy).not.toHaveBeenCalled();
  });

  it('importAudioFile traduce errores de decodeAudioData a un mensaje claro en español y cierra el contexto', async () => {
    const closeSpy = vi.fn(async () => {});
    const fakeContext: AudioDecoderContext = {
      decodeAudioData: vi.fn(async () => {
        throw new DOMException('Unable to decode audio data', 'EncodingError');
      }),
      close: closeSpy,
    };

    const file = new File([new Uint8Array([0x66, 0x4c, 0x61, 0x43])], 'corrupto.flac', {
      type: 'audio/flac',
    });

    await expect(
      importAudioFile(file, { createAudioContext: () => fakeContext }),
    ).rejects.toThrow(AUDIO_DECODE_FAILED_MESSAGE);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
