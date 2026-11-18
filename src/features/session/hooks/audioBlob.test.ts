import { describe, expect, it } from 'vitest';
import { buildAudioBlob } from '@/features/session/hooks/useSessionRestore';

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
