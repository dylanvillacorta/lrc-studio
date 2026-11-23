import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAudioBlob,
  clearPlaybackCache,
  createPlaybackObjectUrl,
  getCachedPlaybackBlob,
} from '@/features/session/hooks/useSessionRestore';

describe('buildAudioBlob (mime del audio restaurado, T26)', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it('ArrayBuffer .flac recibe audio/flac (antes audio/mpeg)', () => {
    expect(buildAudioBlob(bytes.buffer, 'a.flac').type).toBe('audio/flac');
  });

  it('ArrayBuffer .wav, .m4a y .ogg usan su mime canónico', () => {
    expect(buildAudioBlob(bytes.buffer, 'a.wav').type).toBe('audio/wav');
    expect(buildAudioBlob(bytes.buffer, 'a.m4a').type).toBe('audio/mp4');
    expect(buildAudioBlob(bytes.buffer, 'a.ogg').type).toBe('audio/ogg');
  });

  it('Blob sin type u octet-stream se re-envuelve con el mime de la extensión', () => {
    expect(buildAudioBlob(new Blob([bytes]), 'a.flac').type).toBe('audio/flac');
    expect(
      buildAudioBlob(new Blob([bytes], { type: 'application/octet-stream' }), 'a.mp3').type,
    ).toBe('audio/mpeg');
  });

  it('Blob con type correcto se reutiliza sin copiarlo', () => {
    const blob = new Blob([bytes], { type: 'audio/wav' });
    expect(buildAudioBlob(blob, 'a.wav')).toBe(blob);
  });
});

describe('createPlaybackObjectUrl (WAV PCM de reproducción)', () => {
  afterEach(() => {
    clearPlaybackCache();
    vi.unstubAllGlobals();
  });

  function stubUrl() {
    const created: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return `blob:test-${created.length}`;
      },
      revokeObjectURL: () => {},
    });
    return created;
  }

  it('usa el WAV decodificado, lo cachea y la reparación lo reutiliza sin decodificar', async () => {
    const created = stubUrl();
    const wav = new Blob([new Uint8Array([9])], { type: 'audio/wav' });
    const decode = vi.fn(async () => ({ blob: wav, warning: null }));
    const original = new Blob([new Uint8Array([1])], { type: 'audio/mpeg' });

    const first = await createPlaybackObjectUrl(original, 'a.mp3', { projectId: 'p1', decode });
    expect(first.url).toBe('blob:test-1');
    expect(created[0]).toBe(wav);
    expect(getCachedPlaybackBlob('p1')).toBe(wav);

    const repaired = await createPlaybackObjectUrl(original, 'a.mp3', { projectId: 'p1', decode });
    expect(repaired.url).toBe('blob:test-2');
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('si no hay WAV usa el original y propaga el aviso', async () => {
    const created = stubUrl();
    const original = new Blob([new Uint8Array([1])], { type: 'audio/mpeg' });
    const decode = vi.fn(async () => ({ blob: null, warning: 'aviso' }));
    const result = await createPlaybackObjectUrl(original, 'a.mp3', { projectId: 'p2', decode });
    expect(result.warning).toBe('aviso');
    expect(created[0]).toBe(original);
    expect(getCachedPlaybackBlob('p2')).toBeNull();
  });
});
