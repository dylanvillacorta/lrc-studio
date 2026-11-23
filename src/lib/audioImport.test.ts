import { describe, expect, it, vi } from 'vitest';
import {
  AUDIO_DECODE_FAILED_MESSAGE,
  AUDIO_READ_FAILED_MESSAGE,
  extractPeaksAndDuration,
  PLAYBACK_PREPARE_FAILED_MESSAGE,
  decodePlaybackBlob,
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

  it('importAudioFile conserva bytes de FLAC cuando llega con application/octet-stream o tipo vacío', async () => {
    const flacBytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0x00, 0x00, 0x22]);
    const fakeContext: AudioDecoderContext = {
      decodeAudioData: vi.fn(async () => ({
        duration: 1.0,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array([0.25, -0.25]),
      })),
      close: vi.fn(async () => {}),
    };

    for (const declaredType of ['', 'application/octet-stream']) {
      const file = new File([flacBytes], 'drive-master.flac', { type: declaredType });
      const imported = await importAudioFile(file, {
        bins: 2,
        createAudioContext: () => fakeContext,
      });

      expect(imported.blob.type).toBe('audio/flac');
      expect(new Uint8Array(await imported.blob.arrayBuffer())).toEqual(flacBytes);
    }
  });

  it('importAudioFile traduce errores al leer el archivo (ej. descarga de nube fallida) a español sin abrir AudioContext', async () => {
    const createCtxSpy = vi.fn();
    await expect(
      importAudioFile(
        {
          name: 'nube.flac',
          type: 'application/octet-stream',
          arrayBuffer: async () => {
            throw new DOMException('NotReadableError');
          },
        },
        { createAudioContext: createCtxSpy },
      ),
    ).rejects.toThrow(AUDIO_READ_FAILED_MESSAGE);
    expect(createCtxSpy).not.toHaveBeenCalled();
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

describe('audioImport: WAV de reproducción para formatos no WAV', () => {
  const decoded = {
    duration: 2 / 44_100,
    numberOfChannels: 2,
    getChannelData: (c: number) =>
      c === 0 ? new Float32Array([0.5, -0.5]) : new Float32Array([0.25, -0.25]),
  };
  const ctx = (): AudioDecoderContext => ({ decodeAudioData: async () => decoded });

  it('importAudioFile de MP3 devuelve un WAV PCM 16 bits y conserva el blob original', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'a.mp3', { type: 'audio/mpeg' });
    const imported = await importAudioFile(file, { createAudioContext: ctx });
    expect(imported.blob.type).toBe('audio/mpeg');
    expect(imported.playbackBlob?.type).toBe('audio/wav');
    expect(imported.playbackBlob?.size).toBe(44 + 2 * 2 * 2);
    expect(imported.playbackWarning).toBeNull();
    const head = new Uint8Array(await imported.playbackBlob!.arrayBuffer());
    expect(String.fromCharCode(...head.slice(0, 4))).toBe('RIFF');
  });

  it('importAudioFile de FLAC también genera el WAV y conserva el original', async () => {
    const file = new File([new Uint8Array([1])], 'a.flac', { type: 'audio/flac' });
    const imported = await importAudioFile(file, { createAudioContext: ctx });
    expect(imported.blob.type).toBe('audio/flac');
    expect(imported.playbackBlob?.type).toBe('audio/wav');
    expect(imported.playbackWarning).toBeNull();
  });

  it('importAudioFile de WAV PCM no genera WAV de reproducción', async () => {
    const file = new File([new Uint8Array([1])], 'a.wav', { type: 'audio/wav' });
    const imported = await importAudioFile(file, { createAudioContext: ctx });
    expect(imported.playbackBlob).toBeNull();
    expect(imported.playbackWarning).toBeNull();
  });

  it('el WAV de reproducción es PCM de 16 bits a 44,1 kHz', async () => {
    const file = new File([new Uint8Array([1])], 'hires.flac', { type: 'audio/flac' });
    const imported = await importAudioFile(file, { createAudioContext: ctx });
    const view = new DataView(await imported.playbackBlob!.arrayBuffer());
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('si la codificación falla devuelve null y un aviso, sin romper la importación', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const empty: AudioDecoderContext = {
      decodeAudioData: async () => ({ ...decoded, duration: 0 }),
    };
    const file = new File([new Uint8Array([1])], 'a.mp3', { type: 'audio/mpeg' });
    const imported = await importAudioFile(file, { createAudioContext: () => empty });
    expect(imported.playbackBlob).toBeNull();
    expect(imported.playbackWarning).toBe(PLAYBACK_PREPARE_FAILED_MESSAGE);
    warn.mockRestore();
  });

  it('decodePlaybackBlob decodifica MP3 y omite WAV', async () => {
    const mp3 = new Blob([new Uint8Array([1, 2])], { type: 'audio/mpeg' });
    const result = await decodePlaybackBlob(mp3, 'a.mp3', { createAudioContext: ctx });
    expect(result.blob?.type).toBe('audio/wav');
    const wav = new Blob([new Uint8Array([1, 2])], { type: 'audio/wav' });
    expect(await decodePlaybackBlob(wav, 'a.wav', { createAudioContext: ctx })).toEqual({
      blob: null,
      warning: null,
    });
  });

  it('decodePlaybackBlob avisa cuando la decodificación falla', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing: AudioDecoderContext = {
      decodeAudioData: async () => {
        throw new Error('boom');
      },
    };
    const result = await decodePlaybackBlob(new ArrayBuffer(4), 'a.mp3', {
      createAudioContext: () => failing,
    });
    expect(result).toEqual({ blob: null, warning: PLAYBACK_PREPARE_FAILED_MESSAGE });
    warn.mockRestore();
  });
});
