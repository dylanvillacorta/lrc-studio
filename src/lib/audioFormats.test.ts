import { describe, expect, it } from 'vitest';
import {
  AUDIO_INPUT_ACCEPT,
  AUDIO_MIME_BY_EXTENSION,
  SUPPORTED_AUDIO_EXTENSIONS,
  inferAudioMime,
  isSupportedAudioFile,
} from './audioFormats';

describe('audioFormats', () => {
  it('expone una lista única de extensiones soportadas con su MIME canónico', () => {
    expect(SUPPORTED_AUDIO_EXTENSIONS).toEqual([
      'mp3',
      'wav',
      'flac',
      'ogg',
      'oga',
      'm4a',
      'aac',
      'opus',
      'webm',
    ]);
    expect(AUDIO_MIME_BY_EXTENSION.flac).toBe('audio/flac');
    expect(AUDIO_INPUT_ACCEPT).toContain('audio/*');
    expect(AUDIO_INPUT_ACCEPT).toContain('.flac');
    for (const ext of SUPPORTED_AUDIO_EXTENSIONS) {
      expect(AUDIO_INPUT_ACCEPT).toContain(`.${ext}`);
    }
  });

  describe('inferAudioMime', () => {
    it('resuelve extensión .flac y .FLAC en mayúsculas como audio/flac', () => {
      expect(inferAudioMime('master.flac')).toBe('audio/flac');
      expect(inferAudioMime('MASTER.FLAC')).toBe('audio/flac');
    });

    it('normaliza audio/x-flac a audio/flac', () => {
      expect(inferAudioMime('sin-extension', 'audio/x-flac')).toBe('audio/flac');
      expect(inferAudioMime('master.flac', 'AUDIO/X-FLAC')).toBe('audio/flac');
    });

    it('prefiere el tipo declarado cuando es audio/* y cae a extensión si está vacío o es octet-stream', () => {
      expect(inferAudioMime('archivo.bin', 'audio/ogg')).toBe('audio/ogg');
      expect(inferAudioMime('pista.flac', '')).toBe('audio/flac');
      expect(inferAudioMime('pista.flac', 'application/octet-stream')).toBe('audio/flac');
      expect(inferAudioMime('pista.ogg', 'text/plain')).toBe('audio/ogg');
    });

    it('maneja nombres sin extensión y dobles extensiones', () => {
      expect(inferAudioMime('sinextension', '')).toBe('application/octet-stream');
      expect(inferAudioMime('archivo.', '')).toBe('application/octet-stream');
      expect(inferAudioMime('cancion.v2.flac', '')).toBe('audio/flac');
      expect(inferAudioMime('cancion.flac.txt', '')).toBe('application/octet-stream');
    });
  });

  describe('isSupportedAudioFile', () => {
    it('acepta archivos de audio válidos por MIME o extensión', () => {
      expect(isSupportedAudioFile({ name: 'master.flac', type: '' })).toBe(true);
      expect(isSupportedAudioFile({ name: 'MASTER.FLAC', type: 'application/octet-stream' })).toBe(
        true,
      );
      expect(isSupportedAudioFile({ name: 'blob', type: 'audio/x-flac' })).toBe(true);
      expect(isSupportedAudioFile({ name: 'demo.opus', type: '' })).toBe(true);
    });

    it('rechaza archivos no-audio o sin extensión ni MIME válido', () => {
      expect(isSupportedAudioFile({ name: 'notas.txt', type: 'text/plain' })).toBe(false);
      expect(isSupportedAudioFile({ name: 'notas.flac.txt', type: '' })).toBe(false);
      expect(isSupportedAudioFile({ name: 'sinextension', type: '' })).toBe(false);
    });
  });
});
