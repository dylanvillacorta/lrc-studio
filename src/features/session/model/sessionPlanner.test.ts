import { describe, expect, it } from 'vitest';
import type { AudioBinary, ProjectFullData, SessionState } from '@/types';
import { buildSessionState, planRestore } from './sessionPlanner';

function makeProject(overrides: Partial<ProjectFullData> = {}): ProjectFullData {
  return {
    id: 'proj-1',
    title: 'Canción',
    artist: 'Artista',
    audioFileName: 'tema.mp3',
    durationMs: 10_000,
    totalLines: 2,
    syncedLines: 1,
    totalWords: 3,
    syncedWords: 1,
    lineProgress: 50,
    wordProgress: 33,
    updatedAt: 1000,
    createdAt: 500,
    waveformPeaks: [0.1, 0.5, 0.9],
    settings: {
      playbackRate: 1,
      preRollSeconds: 2.5,
      sniperMode: false,
      autoAdvance: true,
    },
    lines: [
      {
        id: 'l1',
        text: 'Primera línea',
        startMs: 1000,
        endMs: 3000,
        words: [
          { id: 'w1', text: 'Primera', startMs: 1000, endMs: 1800 },
          { id: 'w2', text: 'línea', startMs: 1800, endMs: 3000 },
        ],
      },
      {
        id: 'l2',
        text: 'Fin',
        startMs: null,
        endMs: null,
        words: [{ id: 'w3', text: 'Fin', startMs: null, endMs: null }],
      },
    ],
    ...overrides,
  };
}

describe('sessionPlanner', () => {
  it('buildSessionState sanea valores negativos o no finitos', () => {
    const state = buildSessionState({
      projectId: 'proj-1',
      activeTab: 'word',
      currentTime: -50,
      activeLineIndex: Number.NaN,
      activeWordIndex: 2.9,
      updatedAt: 9999,
    });

    expect(state).toEqual({
      projectId: 'proj-1',
      activeTab: 'word',
      currentTime: 0,
      activeLineIndex: 0,
      activeWordIndex: 2,
      updatedAt: 9999,
    });
  });

  it('planRestore devuelve null sin lanzar si el proyecto no existe o no coincide', () => {
    const session: SessionState = {
      projectId: 'proj-inexistente',
      activeTab: 'sync',
      currentTime: 1200,
      activeLineIndex: 0,
      activeWordIndex: 0,
      updatedAt: 1000,
    };

    expect(planRestore(null, makeProject(), null)).toBeNull();
    expect(planRestore(session, null, null)).toBeNull();
    expect(planRestore(session, makeProject({ id: 'otro-id' }), null)).toBeNull();
    expect(
      planRestore({ ...session, projectId: null }, makeProject(), null),
    ).toBeNull();
  });

  it('planRestore acota índices de línea, palabra y currentTime dentro de los límites válidos', () => {
    const project = makeProject();
    const audio: AudioBinary = {
      blob: new Blob([new Uint8Array([1, 2, 3])]),
      fileName: 'tema.mp3',
      peaks: [0.2, 0.8],
      duration: 8.5,
    };

    const session: SessionState = {
      projectId: 'proj-1',
      activeTab: 'loupe',
      currentTime: 99_999,
      activeLineIndex: 99,
      activeWordIndex: 99,
      updatedAt: 2000,
    };

    const plan = planRestore(session, project, audio);
    expect(plan).not.toBeNull();
    expect(plan?.activeTab).toBe('loupe');
    expect(plan?.activeLineIndex).toBe(1);
    expect(plan?.activeWordIndex).toBe(0);
    expect(plan?.currentTime).toBe(8500);
    expect(plan?.peaks).toEqual([0.2, 0.8]);
    expect(plan?.duration).toBe(8.5);
  });

  it('planRestore maneja índices negativos y proyectos sin líneas', () => {
    const emptyProject = makeProject({ lines: [] });
    const session: SessionState = {
      projectId: 'proj-1',
      activeTab: 'sync',
      currentTime: -100,
      activeLineIndex: -5,
      activeWordIndex: -3,
      updatedAt: 2000,
    };

    const plan = planRestore(session, emptyProject, null);
    expect(plan).not.toBeNull();
    expect(plan?.activeLineIndex).toBe(0);
    expect(plan?.activeWordIndex).toBe(0);
    expect(plan?.currentTime).toBe(0);
  });
});
