import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DesktopLayout } from '@/app/layouts/DesktopLayout';
import {
  StorageProvider,
  type ActiveProjectContextValue,
} from '@/app/providers';
import { ActiveProjectContext } from '@/app/providers/activeProjectContext';
import { checkVersionOnce, UpdateBanner } from '@/features/version';
import type { IStorageAdapter } from '@/storage';
import type { ProjectFullData } from '@/types';

const SAMPLE_PROJECT: ProjectFullData = {
  id: 'proj-demo',
  title: 'Noches de Verano',
  artist: 'Luna Alba',
  audioFileName: 'noches.wav',
  durationMs: 225600,
  totalLines: 1,
  syncedLines: 1,
  totalWords: 3,
  syncedWords: 2,
  lineProgress: 75,
  wordProgress: 62,
  updatedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  waveformPeaks: [0.2, 0.5, 0.8, 0.4, 0.6],
  settings: {
    preRollSeconds: 2.5,
    sniperMode: true,
    autoAdvance: true,
    playbackRate: 1,
  },
  lines: [
    {
      id: 'l1',
      text: 'corazón de sal y fuego',
      startMs: 71000,
      endMs: 74000,
      words: [
        { id: 'w1', text: 'corazón', startMs: 71000, endMs: 72000 },
        { id: 'w2', text: 'de', startMs: 72340, endMs: 72690 },
        { id: 'w3', text: 'sal', startMs: null, endMs: null },
      ],
    },
  ],
};

function createStubStorage(): IStorageAdapter {
  return {
    init: async () => {},
    listProjects: async () => [SAMPLE_PROJECT],
    getProject: async () => SAMPLE_PROJECT,
    saveProject: async () => {},
    saveAudioBinary: async () => {},
    getAudioBinary: async () => null,
    deleteProject: async () => {},
    getSessionState: async () => null,
    saveSessionState: async () => {},
    exportFullCatalogBackup: async () => '{}',
    importCatalogBackup: async () => {},
  };
}

function createSampleContext(
  overrides: Partial<ActiveProjectContextValue> = {},
): ActiveProjectContextValue {
  return {
    project: SAMPLE_PROJECT,
    restoreStatus: 'ready',
    restoreError: null,
    activeTab: 'word',
    setActiveTab: () => {},
    audioUrl: 'blob:demo-audio',
    waveformPeaks: SAMPLE_PROJECT.waveformPeaks,
    audioDuration: 225.6,
    saveStatus: 'saved',
    autosaveState: { status: 'saved', lastSavedAt: 1_700_000_000_000, error: null },
    sync: {
      lines: SAMPLE_PROJECT.lines,
      activeLineIndex: 0,
      activeWordIndex: 1,
      canUndo: true,
      progress: {
        totalLines: 1,
        syncedLines: 1,
        lineProgress: 100,
        totalWords: 3,
        syncedWords: 2,
        wordProgress: 67,
      },
      setActiveLineIndex: () => {},
      setActiveWordIndex: () => {},
      replaceLines: () => {},
      stampLineStart: () => {},
      stampLineEnd: () => {},
      undoLine: () => 0,
      stampWordStart: () => ({
        shouldPause: false,
        shouldRewindPreRoll: false,
        completedLine: false,
      }),
      stampWordEnd: () => ({
        shouldPause: false,
        shouldRewindPreRoll: false,
        completedLine: false,
      }),
      distributeWordsInLine: () => {},
      nudgeWord: () => {},
      nudgeLine: () => {},
      undo: () => true,
      resetHistory: () => {},
    },
    player: {
      currentTime: 72340,
      duration: 225600,
      isPlaying: false,
      isSeeking: false,
      playbackRate: 1,
      getCurrentTimeMs: () => 72340,
      play: async () => {},
      pause: () => {},
      togglePlay: () => {},
      seekTo: () => {},
      setSeeking: () => {},
      setPlaybackRate: () => {},
    },
    openProject: async () => {},
    createProject: async () => SAMPLE_PROJECT,
    attachAudio: async () => {},
    updateProjectMetadata: () => {},
    clearActiveProject: async () => {},
    flushPendingSave: async () => {},
    ...overrides,
  };
}

describe('DesktopLayout y montaje de versión', () => {
  it('renderiza las 3 columnas de escritorio, palabra objetivo, inspector y leyenda de atajos', () => {
    const html = renderToString(
      <StorageProvider adapter={createStubStorage()}>
        <ActiveProjectContext.Provider value={createSampleContext()}>
          <DesktopLayout />
        </ActiveProjectContext.Provider>
      </StorageProvider>,
    );

    expect(html).toContain('LyricSync Studio');
    expect(html).toContain('Línea');
    expect(html).toContain('Palabra');
    expect(html).toContain('Ráfaga');
    expect(html).toContain('Karaoke');
    expect(html).toContain('Guardado');
    expect(html).toContain('Exportar LRC / ELRC / JSON');
    expect(html).toContain('Mis transcripciones');
    expect(html).toContain('Nueva transcripción');
    expect(html).toContain('PALABRA OBJETIVO');
    expect(html).toContain('Repetir Pre-Roll');
    expect(html).toContain('MARCAR PALABRA');
    expect(html).toContain('Inspector');
    expect(html).toContain('Atajos de teclado');
    expect(html).toContain('Espacio');
    expect(html).toContain('Ctrl+Z');
    expect(html).toContain('aria-label="Modo de sincronización"');
    expect(html).toContain('aria-label="Inspector de tiempos"');
    expect(html).toContain('aria-label="Atajos de teclado"');
    expect(html).toContain('aria-label="Abrir lupa de onda"');
    expect(html).toContain('aria-label="Información de la aplicación"');
    expect(html).not.toContain('<footer');
  });

  it('detecta nueva versión con fetch falso, muestra UpdateBanner y ejecuta flushPendingSave antes de recargar', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({ version: '9.9.9', commit: 'abc1234' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const hasUpdate = await checkVersionOnce(
      { version: '0.1.0', commit: 'old0000' },
      fakeFetch,
    );
    expect(hasUpdate).toBe(true);
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    const flushPendingSave = vi.fn(async () => {});
    const bannerHtml = renderToString(
      <UpdateBanner updateAvailable={hasUpdate} onUpdate={flushPendingSave} />,
    );
    expect(bannerHtml).toContain('Nueva versión disponible');
    expect(bannerHtml).toContain('Actualizar');
  });
});
