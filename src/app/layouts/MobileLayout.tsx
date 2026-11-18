import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MobileHeader } from '@/app/layouts/MobileHeader';
import { useActiveProject, useStorage } from '@/app/providers';
import { CatalogPanel, useCatalog } from '@/features/catalog';
import { ExportScreen, type ParsedProjectJson } from '@/features/export';
import { LoupeScreen, type LineBounds } from '@/features/loupe';
import {
  buildStructuredLinesFromText,
  INITIAL_DEMO_LYRICS,
  LyricsScreen,
  mergeRawTextWithExistingLines,
} from '@/features/lyrics';
import { DEFAULT_PRE_ROLL_MS, getActiveLineWindow } from '@/features/sync';
import { KaraokePreview } from '@/features/sync/components/KaraokePreview';
import { LineSyncScreen } from '@/features/sync/components/LineSyncScreen';
import {
  createDemoAudioFile,
  type SyncSegmentedMode,
} from '@/features/sync/components/syncViewHelpers';
import { WordSyncScreen } from '@/features/sync/components/WordSyncScreen';
import {
  usePlaybackTime,
  type PlaybackTimeStore,
} from '@/features/sync/hooks/playbackTimeStore';
import {
  UpdateBanner,
  VersionFooter,
  useVersionCheck,
} from '@/features/version';
import { downloadTextFile } from '@/lib/download';
import type { LyricLine } from '@/types';
import { NavBar, type NavBarItem } from '@/ui';

const NAV_ITEMS: readonly NavBarItem<'catalog' | 'lyrics' | 'sync' | 'export'>[] = [
  { id: 'catalog', label: 'Catálogo', icon: 'library' },
  { id: 'lyrics', label: 'Letra', icon: 'lines' },
  { id: 'sync', label: 'Sincronizar', icon: 'sync' },
  { id: 'export', label: 'Exportar', icon: 'export' },
];

const MobileLoupeBridge = memo(function MobileLoupeBridge({
  peaks,
  durationMs,
  timeStore,
  fallbackTimeMs,
  line,
  lineIndex,
  lines,
  isSaved,
  onChange,
  onPlayBurst,
  onApply,
  onBack,
}: {
  peaks: number[];
  durationMs: number;
  timeStore: PlaybackTimeStore | null;
  fallbackTimeMs: number;
  line: LyricLine;
  lineIndex: number;
  lines: LyricLine[];
  isSaved: boolean;
  onChange: (bounds: LineBounds) => void;
  onPlayBurst: () => void;
  onApply: (bounds: LineBounds) => void;
  onBack: () => void;
}) {
  const effectiveTimeMs = usePlaybackTime(timeStore, fallbackTimeMs, 33);
  return (
    <LoupeScreen
      peaks={peaks}
      durationMs={durationMs}
      currentTimeMs={effectiveTimeMs}
      line={line}
      lineIndex={lineIndex}
      lines={lines}
      isSaved={isSaved}
      onChange={onChange}
      onPlayBurst={onPlayBurst}
      onApply={onApply}
      onBack={onBack}
    />
  );
});

/**
 * Contenedor principal móvil («Estudio táctil» 390×844) que conecta las 6 vistas.
 */
export function MobileLayout() {
  const storage = useStorage();
  const {
    project,
    activeTab,
    setActiveTab,
    audioUrl,
    waveformPeaks,
    audioDuration,
    saveStatus,
    sync,
    player,
    openProject,
    createProject,
    attachAudio,
    updateProjectMetadata,
    clearActiveProject,
    flushPendingSave,
  } = useActiveProject();

  const catalog = useCatalog(storage);
  const { refresh: refreshCatalog } = catalog;
  const { updateAvailable, applyUpdate } = useVersionCheck({
    flush: flushPendingSave,
  });
  const [syncSubView, setSyncSubView] = useState<'default' | 'burst' | 'karaoke'>('default');
  const [holdMode, setHoldMode] = useState(false);
  const [loupeReturnTab, setLoupeReturnTab] = useState<'sync' | 'word'>('sync');
  const playerRef = useRef(player);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const getCurrentTimeMs = useCallback(
    () => playerRef.current.getCurrentTimeMs?.() ?? playerRef.current.currentTime,
    [],
  );

  const durationMs =
    player.duration > 0
      ? player.duration
      : Math.round(audioDuration * 1000) || (project?.durationMs ?? 0);

  const preRollMs =
    project && project.settings.preRollSeconds > 0
      ? Math.round(project.settings.preRollSeconds * 1000)
      : DEFAULT_PRE_ROLL_MS;

  const sniperMode = project?.settings.sniperMode ?? true;
  const burstActive = syncSubView === 'burst';

  const burstWindow = useMemo(() => {
    if (!burstActive || sync.lines.length === 0) {
      return null;
    }
    return getActiveLineWindow(sync.lines, sync.activeLineIndex, {
      preRollMs,
      durationMs,
    });
  }, [burstActive, durationMs, preRollMs, sync.activeLineIndex, sync.lines]);

  // Bucle continuo para modo Ráfaga de línea aislada.
  useEffect(() => {
    if (!burstActive || !burstWindow || !player.isPlaying) {
      return;
    }
    const timeStore = player.timeStore;
    if (!timeStore) {
      if (player.currentTime >= burstWindow.windowEndMs) {
        player.seekTo(burstWindow.windowStartMs);
      }
      return;
    }
    const checkBurstEnd = () => {
      if (timeStore.getTimeMs() >= burstWindow.windowEndMs) {
        player.seekTo(burstWindow.windowStartMs);
      }
    };
    checkBurstEnd();
    return timeStore.subscribe(checkBurstEnd);
  }, [burstActive, burstWindow, player]);

  useEffect(() => {
    if (activeTab === 'catalog') {
      void flushPendingSave().then(() => refreshCatalog());
    }
  }, [activeTab, flushPendingSave, refreshCatalog]);

  const { seekTo, play, togglePlay } = player;
  const { lines: syncLines, activeLineIndex: syncActiveLineIndex, replaceLines } = sync;

  const handleSelectMode = useCallback(
    (mode: SyncSegmentedMode) => {
      if (mode === 'line') {
        setSyncSubView('default');
        setActiveTab('sync');
        return;
      }
      if (mode === 'word') {
        setSyncSubView('default');
        setActiveTab('word');
        return;
      }
      if (mode === 'karaoke') {
        setSyncSubView('karaoke');
        setActiveTab('sync');
        return;
      }
      if (syncLines.length > 0) {
        const win = getActiveLineWindow(syncLines, syncActiveLineIndex, {
          preRollMs,
          durationMs,
        });
        setSyncSubView('burst');
        setActiveTab('sync');
        seekTo(win.windowStartMs);
        void play();
      }
    },
    [durationMs, play, preRollMs, seekTo, setActiveTab, syncActiveLineIndex, syncLines],
  );

  const handleUploadAudio = useCallback(
    async (file: File) => {
      if (!project) {
        const baseTitle = file.name.replace(/\.[^.]+$/, '').trim() || 'Nueva canción';
        await createProject({ title: baseTitle, artist: '' });
      }
      await attachAudio(file);
    },
    [attachAudio, createProject, project],
  );

  const handleUseDemo = useCallback(async () => {
    if (!project) {
      await createProject({ title: 'Noches de Verano', artist: 'Luna Alba' });
    }
    const demo = createDemoAudioFile(28);
    await attachAudio(demo.file);
    if (syncLines.length === 0) {
      replaceLines(buildStructuredLinesFromText(INITIAL_DEMO_LYRICS, true), false);
    }
  }, [attachAudio, createProject, project, replaceLines, syncLines.length]);

  const handleOpenLoupe = useCallback(() => {
    if (!sync.lines[sync.activeLineIndex]) {
      return;
    }
    setSyncSubView('default');
    setLoupeReturnTab(activeTab === 'word' ? 'word' : 'sync');
    setActiveTab('loupe');
  }, [activeTab, setActiveTab, sync.activeLineIndex, sync.lines]);

  const handleLoupeBoundsChange = useCallback(
    (bounds: LineBounds) => {
      const line = sync.lines[sync.activeLineIndex];
      if (!line) {
        return;
      }
      const nextLines = sync.lines.map((item, idx) =>
        idx === sync.activeLineIndex
          ? { ...item, startMs: bounds.startMs, endMs: bounds.endMs }
          : item,
      );
      sync.replaceLines(nextLines, false);
    },
    [sync],
  );

  const handleLoupePlayBurst = useCallback(() => {
    const win = getActiveLineWindow(sync.lines, sync.activeLineIndex, {
      preRollMs,
      durationMs,
    });
    player.seekTo(win.windowStartMs);
    void player.play();
  }, [durationMs, player, preRollMs, sync.activeLineIndex, sync.lines]);

  const handleImportJson = useCallback(
    async (parsed: ParsedProjectJson) => {
      const title = parsed.metadata.title ?? 'Sin título';
      const artist = parsed.metadata.artist ?? '';
      if (!project) {
        await createProject({ title, artist });
      } else {
        updateProjectMetadata({ title, artist });
      }
      sync.replaceLines(parsed.lines);
      setActiveTab('sync');
    },
    [createProject, project, setActiveTab, sync, updateProjectMetadata],
  );

  const handleNavSelect = useCallback(
    (tab: 'catalog' | 'lyrics' | 'sync' | 'export') => {
      setSyncSubView('default');
      setActiveTab(tab);
    },
    [setActiveTab],
  );

  const handleOpenCatalogFromHeader = useCallback(() => {
    handleNavSelect('catalog');
  }, [handleNavSelect]);

  const handleRetrySave = useCallback(() => {
    void flushPendingSave();
  }, [flushPendingSave]);

  const handleChangePlaybackRate = useCallback(
    (rate: number) => {
      player.setPlaybackRate(rate);
      if (project) {
        updateProjectMetadata({
          settings: { ...project.settings, playbackRate: rate },
        });
      }
    },
    [player, project, updateProjectMetadata],
  );

  const handleSelectLine = useCallback(
    (index: number) => {
      sync.setActiveLineIndex(index);
      sync.setActiveWordIndex(0);
    },
    [sync],
  );

  const handleStampLine = useCallback(
    (nowMs: number) => {
      sync.stampLineStart(nowMs, false);
    },
    [sync],
  );

  const handleStopBurst = useCallback(() => {
    setSyncSubView('default');
    player.pause();
  }, [player]);

  const handleToggleSniper = useCallback(() => {
    if (project) {
      updateProjectMetadata({
        settings: { ...project.settings, sniperMode: !sniperMode },
      });
    }
  }, [project, sniperMode, updateProjectMetadata]);

  const handleToggleHold = useCallback(() => {
    setHoldMode((prev) => !prev);
  }, []);

  const handleLoupeApply = useCallback(
    (bounds: LineBounds) => {
      handleLoupeBoundsChange(bounds);
      setActiveTab(loupeReturnTab);
    },
    [handleLoupeBoundsChange, loupeReturnTab, setActiveTab],
  );

  const handleLoupeBack = useCallback(() => {
    setActiveTab(loupeReturnTab);
  }, [loupeReturnTab, setActiveTab]);

  const fallbackCurrentTimeMs = player.timeStore ? 0 : player.currentTime;

  const activeLine = sync.lines[sync.activeLineIndex];
  const lineNumber = sync.lines.length > 0 ? sync.activeLineIndex + 1 : 0;
  const wordNumber =
    activeLine && activeLine.words.length > 0 ? sync.activeWordIndex + 1 : 0;

  const subtitle =
    activeTab === 'word' && activeLine
      ? `Línea ${lineNumber} · palabra ${wordNumber} de ${activeLine.words.length}`
      : project
        ? `${project.artist || 'Sin artista'} · Línea ${lineNumber} de ${sync.lines.length}`
        : 'Sin proyecto activo';

  const showTopHeader = activeTab !== 'catalog' && activeTab !== 'loupe';
  const showNavBar = activeTab !== 'loupe';
  const navActiveId: 'catalog' | 'lyrics' | 'sync' | 'export' =
    activeTab === 'word' || activeTab === 'loupe' ? 'sync' : activeTab;

  return (
    <div className="min-h-dvh w-full bg-bg text-ink flex justify-center">
      <div className="w-full max-w-[430px] h-dvh flex flex-col overflow-hidden bg-bg">
        <div className="px-4 pt-2 empty:hidden">
          <UpdateBanner updateAvailable={updateAvailable} onUpdate={applyUpdate} />
        </div>
        {showTopHeader ? (
          <MobileHeader
            title={project?.title || 'LyricSync Studio'}
            subtitle={subtitle}
            saveStatus={saveStatus}
            onOpenCatalog={handleOpenCatalogFromHeader}
            onRetrySave={handleRetrySave}
          />
        ) : null}

        <main className="flex-1 min-h-0 px-4 pb-3 [@media(max-height:720px)]:pb-1.5 flex flex-col overflow-y-auto">
          {activeTab === 'catalog' ? (
            <CatalogPanel
              projects={catalog.projects}
              activeProjectId={project?.id ?? null}
              loading={catalog.loading}
              error={catalog.error}
              onOpen={async (id) => {
                await openProject(id);
                setActiveTab('sync');
              }}
              onCreate={async () => {
                await createProject();
                setActiveTab('sync');
              }}
              onDuplicate={async (id) => {
                await catalog.duplicateProject(id);
              }}
              onExportBackup={async (id) => {
                const backup = await catalog.exportProjectBackup(id);
                if (backup) {
                  downloadTextFile(
                    backup.fileName,
                    backup.json,
                    'application/json;charset=utf-8',
                  );
                }
              }}
              onImportBackup={catalog.importBackup}
              onDelete={async (id) => {
                if (id === project?.id) {
                  await clearActiveProject();
                }
                await catalog.deleteProject(id);
              }}
              onClose={() => setActiveTab('sync')}
            />
          ) : null}

          {activeTab === 'lyrics' ? (
            <LyricsScreen
              title={project?.title ?? ''}
              artist={project?.artist ?? ''}
              rawText={sync.lines.map((l) => l.text).join('\n')}
              existingLines={sync.lines}
              onTitleChange={async (title) => {
                if (!project) {
                  await createProject({ title, artist: '' });
                  return;
                }
                updateProjectMetadata({ title });
              }}
              onArtistChange={async (artist) => {
                if (!project) {
                  await createProject({ title: 'Sin título', artist });
                  return;
                }
                updateProjectMetadata({ artist });
              }}
              onApply={async (rawText) => {
                if (!project) {
                  await createProject();
                }
                const merged = mergeRawTextWithExistingLines(rawText, sync.lines);
                sync.replaceLines(merged);
              }}
              onLoadDemo={handleUseDemo}
            />
          ) : null}

          {activeTab === 'sync' && syncSubView === 'karaoke' ? (
            <KaraokePreview
              hasAudio={Boolean(audioUrl)}
              durationMs={durationMs}
              isPlaying={player.isPlaying}
              lines={sync.lines}
              syncMode="karaoke"
              timeStore={player.timeStore}
              pausedTimeMs={player.timeStore ? -1 : player.currentTime}
              getCurrentTimeMs={getCurrentTimeMs}
              onSelectMode={handleSelectMode}
              onTogglePlay={togglePlay}
              onSeek={seekTo}
              onUploadAudio={handleUploadAudio}
              onUseDemo={handleUseDemo}
            />
          ) : null}

          {activeTab === 'sync' && syncSubView !== 'karaoke' ? (
            <LineSyncScreen
              hasAudio={Boolean(audioUrl)}
              peaks={waveformPeaks}
              timeStore={player.timeStore}
              getCurrentTimeMs={getCurrentTimeMs}
              currentTimeMs={fallbackCurrentTimeMs}
              durationMs={durationMs}
              isPlaying={player.isPlaying}
              playbackRate={player.playbackRate}
              lines={sync.lines}
              activeLineIndex={sync.activeLineIndex}
              canUndo={sync.canUndo}
              syncMode={burstActive ? 'burst' : 'line'}
              burstWindow={burstWindow}
              onSelectMode={handleSelectMode}
              onSeek={player.seekTo}
              onTogglePlay={player.togglePlay}
              onChangePlaybackRate={handleChangePlaybackRate}
              onUndo={sync.undo}
              onSelectLine={handleSelectLine}
              onStampLine={handleStampLine}
              onOpenLoupe={handleOpenLoupe}
              onStopBurst={handleStopBurst}
              onUploadAudio={handleUploadAudio}
              onUseDemo={handleUseDemo}
            />
          ) : null}

          {activeTab === 'word' ? (
            <WordSyncScreen
              hasAudio={Boolean(audioUrl)}
              peaks={waveformPeaks}
              timeStore={player.timeStore}
              getCurrentTimeMs={getCurrentTimeMs}
              currentTimeMs={fallbackCurrentTimeMs}
              durationMs={durationMs}
              isPlaying={player.isPlaying}
              lines={sync.lines}
              activeLineIndex={sync.activeLineIndex}
              activeWordIndex={sync.activeWordIndex}
              preRollMs={preRollMs}
              sniperMode={sniperMode}
              holdMode={holdMode}
              syncMode={burstActive ? 'burst' : 'word'}
              onSelectMode={handleSelectMode}
              onToggleSniper={handleToggleSniper}
              onToggleHold={handleToggleHold}
              onSeek={player.seekTo}
              onPlay={player.play}
              onPause={player.pause}
              onStampWordStart={sync.stampWordStart}
              onStampWordEnd={sync.stampWordEnd}
              onOpenLoupe={handleOpenLoupe}
              onUploadAudio={handleUploadAudio}
              onUseDemo={handleUseDemo}
            />
          ) : null}

          {activeTab === 'loupe' && activeLine ? (
            <MobileLoupeBridge
              peaks={waveformPeaks}
              durationMs={durationMs}
              timeStore={player.timeStore ?? null}
              fallbackTimeMs={fallbackCurrentTimeMs}
              line={activeLine}
              lineIndex={sync.activeLineIndex}
              lines={sync.lines}
              isSaved={saveStatus === 'saved' || saveStatus === 'idle'}
              onChange={handleLoupeBoundsChange}
              onPlayBurst={handleLoupePlayBurst}
              onApply={handleLoupeApply}
              onBack={handleLoupeBack}
            />
          ) : null}

          {activeTab === 'export' ? (
            project ? (
              <ExportScreen project={project} onImport={handleImportJson} />
            ) : (
              <div className="flex-1 flex flex-col justify-center items-center text-center p-6 gap-2">
                <p className="m-0 text-sm font-bold text-mute">
                  Abre o crea una transcripción para exportar sus marcas LRC, ELRC o JSON.
                </p>
              </div>
            )
          ) : null}
          <VersionFooter />
        </main>

        {showNavBar ? (
          <NavBar
            items={NAV_ITEMS}
            activeId={navActiveId}
            onSelect={handleNavSelect}
            className="[@media(max-height:720px)]:pt-1.5 [@media(max-height:720px)]:pb-2 [@media(max-height:720px)]:[&>button]:min-h-[48px]"
          />
        ) : null}
      </div>
    </div>
  );
}
