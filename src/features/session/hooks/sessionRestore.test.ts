import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  registerAutosaveLifecycleListeners,
  shouldSchedulePlaybackSave,
} from '@/features/session/hooks/useAutosave';
import { restoreSessionFromAdapter } from '@/features/session/hooks/useSessionRestore';
import { buildSessionState } from '@/features/session/model/sessionPlanner';
import { WebIndexedDBAdapter } from '@/storage';
import type { ProjectFullData } from '@/types';

class FakeVisibilityDocument extends EventTarget {
  visibilityState = 'visible';
}

describe('useAutosave lifecycle & useSessionRestore integration', () => {
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

  it('restauración completa contra WebIndexedDBAdapter real tras simular recarga', async () => {
    const dbName = `lyricsync-session-restore-${Date.now()}`;
    const writerAdapter = new WebIndexedDBAdapter({ dbName, storage: null });
    await writerAdapter.init();

    const project: ProjectFullData = {
      id: 'proj-restore-1',
      title: 'Noche de Estrellas',
      artist: 'Dúo Demo',
      audioFileName: 'noche.wav',
      durationMs: 28_000,
      totalLines: 2,
      syncedLines: 1,
      totalWords: 4,
      syncedWords: 2,
      lineProgress: 50,
      wordProgress: 50,
      updatedAt: 1_700_000_123,
      createdAt: 1_700_000_000,
      waveformPeaks: [0.15, 0.65, 0.92, 0.35],
      settings: {
        playbackRate: 1.25,
        preRollSeconds: 2.5,
        sniperMode: true,
        autoAdvance: true,
      },
      lines: [
        {
          id: 'l-1',
          text: 'Bajo la luna',
          startMs: 500,
          endMs: 2500,
          words: [
            { id: 'w-1', text: 'Bajo', startMs: 500, endMs: 1100 },
            { id: 'w-2', text: 'la', startMs: 1100, endMs: 1500 },
            { id: 'w-3', text: 'luna', startMs: 1500, endMs: 2500 },
          ],
        },
        {
          id: 'l-2',
          text: 'Brilla el mar',
          startMs: 3000,
          endMs: 5500,
          words: [{ id: 'w-4', text: 'Brilla', startMs: 3000, endMs: 4000 }],
        },
      ],
    };

    const audioBytes = new Uint8Array([82, 73, 70, 70, 42, 99, 128, 255]);
    const audioBlob = new Blob([audioBytes], { type: 'audio/wav' });
    const peaks = [0.15, 0.65, 0.92, 0.35];

    await writerAdapter.saveProject(project);
    await writerAdapter.saveAudioBinary(
      project.id,
      audioBlob,
      'noche.wav',
      peaks,
      28,
    );
    await writerAdapter.saveSessionState(
      buildSessionState({
        projectId: project.id,
        activeTab: 'word',
        currentTime: 1850,
        activeLineIndex: 0,
        activeWordIndex: 2,
      }),
    );

    // Simular recarga instanciando un adaptador nuevo sobre la misma base
    const reloadedAdapter = new WebIndexedDBAdapter({ dbName, storage: null });
    const result = await restoreSessionFromAdapter(reloadedAdapter);

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      throw new Error('Se esperaba restauración ready');
    }

    expect(result.plan.projectId).toBe('proj-restore-1');
    expect(result.plan.activeTab).toBe('word');
    expect(result.plan.activeLineIndex).toBe(0);
    expect(result.plan.activeWordIndex).toBe(2);
    expect(result.plan.currentTime).toBe(1850);
    expect(result.plan.peaks).toEqual(peaks);
    expect(result.plan.duration).toBe(28);
    expect(result.plan.project.lines).toEqual(project.lines);

    expect(result.plan.audio).not.toBeNull();
    const restoredBytes = new Uint8Array(
      await (result.plan.audio!.blob as Blob).arrayBuffer(),
    );
    expect(restoredBytes).toEqual(audioBytes);
  });
});
