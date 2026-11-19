import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluatePlaybackSaveTick,
  registerAutosaveLifecycleListeners,
  shouldSchedulePlaybackSave,
} from '@/features/session/hooks/useAutosave';
import {
  createAudioObjectUrl,
  revokeAudioObjectUrl,
} from '@/features/session/hooks/useSessionRestore';

class FakeVisibilityDocument extends EventTarget {
  visibilityState = 'visible';
}

describe('useAutosave lifecycle & ObjectURL helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listeners de visibilitychange (hidden), pagehide y beforeunload disparan flush y se limpian', () => {
    const fakeWindow = new EventTarget();
    const fakeDocument = new FakeVisibilityDocument();
    const onFlush = vi.fn();

    const cleanup = registerAutosaveLifecycleListeners(onFlush, {
      windowTarget: fakeWindow,
      documentTarget: fakeDocument,
    });

    // visibilitychange con estado visible NO debe disparar flush
    fakeDocument.visibilityState = 'visible';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    expect(onFlush).toHaveBeenCalledTimes(0);

    // visibilitychange con estado hidden SÍ dispara flush
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    expect(onFlush).toHaveBeenCalledTimes(1);

    // pagehide dispara flush
    fakeWindow.dispatchEvent(new Event('pagehide'));
    expect(onFlush).toHaveBeenCalledTimes(2);

    // beforeunload dispara flush
    fakeWindow.dispatchEvent(new Event('beforeunload'));
    expect(onFlush).toHaveBeenCalledTimes(3);

    // Tras limpiar, ningún evento vuelve a disparar flush
    cleanup();
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    fakeWindow.dispatchEvent(new Event('pagehide'));
    fakeWindow.dispatchEvent(new Event('beforeunload'));
    expect(onFlush).toHaveBeenCalledTimes(3);
  });

  it('shouldSchedulePlaybackSave limita los guardados durante reproducción a máximo 1 vez por segundo', () => {
    expect(shouldSchedulePlaybackSave(null, 1000)).toBe(true);
    expect(shouldSchedulePlaybackSave(1000, 1500)).toBe(false);
    expect(shouldSchedulePlaybackSave(1000, 1999)).toBe(false);
    expect(shouldSchedulePlaybackSave(1000, 2000)).toBe(true);
  });

  it('evaluatePlaybackSaveTick guarda como máximo 1/s al reproducir y hace flush inmediato al pausar', () => {
    const s0 = evaluatePlaybackSaveTick(
      { wasPlaying: false, lastSavedTickMs: null },
      false,
      100,
    );
    expect(s0.action).toBe('none');

    const s1 = evaluatePlaybackSaveTick(s0.nextState, true, 1000);
    expect(s1.action).toBe('schedule');

    const s2 = evaluatePlaybackSaveTick(s1.nextState, true, 1400);
    expect(s2.action).toBe('none');

    const s3 = evaluatePlaybackSaveTick(s2.nextState, true, 2000);
    expect(s3.action).toBe('schedule');

    const s4 = evaluatePlaybackSaveTick(s3.nextState, false, 2300);
    expect(s4.action).toBe('flush');
    expect(s4.nextState).toEqual({ wasPlaying: false, lastSavedTickMs: null });

    const s5 = evaluatePlaybackSaveTick(s4.nextState, false, 2800);
    expect(s5.action).toBe('none');
  });

  it('createAudioObjectUrl y revokeAudioObjectUrl crean y revocan sin fugas', () => {
    const createSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-audio-1');
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});

    const url = createAudioObjectUrl(new Uint8Array([1, 2, 3]).buffer, 'voz.wav');
    expect(url).toBe('blob:mock-audio-1');
    expect(createSpy).toHaveBeenCalledTimes(1);

    revokeAudioObjectUrl(null);
    expect(revokeSpy).not.toHaveBeenCalled();

    revokeAudioObjectUrl(url);
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-audio-1');
  });
});
