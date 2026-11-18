import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  computeBurstEnterState,
  computeBurstExitState,
  DEFAULT_PRE_ROLL_MS,
  findActiveLineIndex,
  getActiveLineWindow,
  getBurstLoopSeekTargetMs,
  resolvePlaybackTracking,
} from '@/features/sync';
import { KaraokePreview } from '@/features/sync/components/KaraokePreview';
import { LineSyncScreen } from '@/features/sync/components/LineSyncScreen';
import {
  createDemoAudioFile,
  type SyncSegmentedMode,
} from '@/features/sync/components/syncViewHelpers';
import { WordSyncScreen } from '@/features/sync/components/WordSyncScreen';
import {
  UpdateBanner,
  VersionFooter,
  useVersionCheck,
} from '@/features/version';
import { downloadTextFile } from '@/lib/download';
import { NavBar, type NavBarItem } from '@/ui';

const NAV_ITEMS: readonly NavBarItem<'catalog' | 'lyrics' | 'sync' | 'export'>[] = [
  { id: 'catalog', label: 'Catálogo', icon: 'library' },
  { id: 'lyrics', label: 'Letra', icon: 'lines' },
  { id: 'sync', label: 'Sincronizar', icon: 'sync' },
  { id: 'export', label: 'Exportar', icon: 'export' },
];

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
  const [manualOverrideAtPlayingIndex, setManualOverrideAtPlayingIndex] = useState<number | null>(
    null,
  );
  const lastPlayingLineRef = useRef<number>(-1);
  const playerTimeRef = useRef(player.currentTime);

  useEffect(() => {
    playerTimeRef.current = player.currentTime;
  }, [player.currentTime]);

  const getCurrentTimeMs = useCallback(() => playerTimeRef.current, []);

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

  // Bucle continuo para modo Ráfaga de línea aislada (solo si está reproduciendo y editando).
  useEffect(() => {
    if (!burstWindow) {
      return;
    }
    const targetMs = getBurstLoopSeekTargetMs({
      burstActive,
      isPlaying: player.isPlaying,
      isEditing: activeTab === 'sync' && syncSubView === 'burst',
      currentTimeMs: player.currentTime,
      windowStartMs: burstWindow.windowStartMs,
      windowEndMs: burstWindow.windowEndMs,
    });
    if (targetMs !== null) {
      player.seekTo(targetMs);
    }
  }, [activeTab, burstActive, burstWindow, player, syncSubView]);

  useEffect(() => {
    if (activeTab === 'catalog') {
      void flushPendingSave().then(() => refreshCatalog());
    }
  }, [activeTab, flushPendingSave, refreshCatalog]);

  const { seekTo, pause, togglePlay } = player;
  const {
    lines: syncLines,
    activeLineIndex: syncActiveLineIndex,
    setActiveLineIndex: setSyncActiveLineIndex,
    replaceLines,
  } = sync;

  const playingLineIndex = player.isPlaying
    ? findActiveLineIndex(syncLines, player.currentTime)
    : -1;
  const isManualOverrideActive =
    manualOverrideAtPlayingIndex !== null &&
    manualOverrideAtPlayingIndex === playingLineIndex;
  const trackedListIndex =
    isManualOverrideActive || playingLineIndex < 0
      ? syncActiveLineIndex
      : playingLineIndex;

  useEffect(() => {
    const res = resolvePlaybackTracking({
      lines: syncLines,
      currentTimeMs: player.currentTime,
      isPlaying: player.isPlaying,
      activeLineIndex: syncActiveLineIndex,
      lastPlayingLineIndex: lastPlayingLineRef.current,
      manualOverrideAtPlayingIndex: isManualOverrideActive
        ? manualOverrideAtPlayingIndex
        : null,
    });
    lastPlayingLineRef.current = res.playingLineIndex;
    if (res.nextActiveLineIndex !== null && res.nextActiveLineIndex !== syncActiveLineIndex) {
      setSyncActiveLineIndex(res.nextActiveLineIndex);
    }
  }, [
    isManualOverrideActive,
    manualOverrideAtPlayingIndex,
    player.currentTime,
    player.isPlaying,
    setSyncActiveLineIndex,
    syncActiveLineIndex,
    syncLines,
  ]);

  const exitBurstIfNeeded = useCallback(() => {
    const exit = computeBurstExitState(syncSubView === 'burst');
    if (exit.shouldPause) {
      pause();
    }
  }, [pause, syncSubView]);

  const handleSelectMode = useCallback(
    (mode: SyncSegmentedMode) => {
      if (mode === 'line') {
        exitBurstIfNeeded();
        setSyncSubView('default');
        setActiveTab('sync');
        return;
      }
      if (mode === 'word') {
        exitBurstIfNeeded();
        setSyncSubView('default');
        setActiveTab('word');
        return;
      }
      if (mode === 'karaoke') {
        exitBurstIfNeeded();
        setSyncSubView('karaoke');
        setActiveTab('sync');
        return;
      }
      const enter = computeBurstEnterState();
      setSyncSubView('burst');
      setActiveTab('sync');
      if (syncLines.length > 0 && enter.shouldPlay === false) {
        const win = getActiveLineWindow(syncLines, syncActiveLineIndex, {
          preRollMs,
          durationMs,
        });
        seekTo(win.windowStartMs);
      }
    },
    [
      durationMs,
      exitBurstIfNeeded,
      preRollMs,
      seekTo,
      setActiveTab,
      syncActiveLineIndex,
      syncLines,
    ],
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

  const handleOpenLoupe = () => {
    if (!sync.lines[sync.activeLineIndex]) {
      return;
    }
    exitBurstIfNeeded();
    setSyncSubView('default');
    setLoupeReturnTab(activeTab === 'word' ? 'word' : 'sync');
    setActiveTab('loupe');
  };

  const handleLoupeBoundsChange = (bounds: LineBounds) => {
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
  };

  const handleLoupePlayBurst = () => {
    const win = getActiveLineWindow(sync.lines, sync.activeLineIndex, {
      preRollMs,
      durationMs,
    });
    player.seekTo(win.windowStartMs);
    void player.play();
  };

  const handleImportJson = async (parsed: ParsedProjectJson) => {
    const title = parsed.metadata.title ?? 'Sin título';
    const artist = parsed.metadata.artist ?? '';
    if (!project) {
      await createProject({ title, artist });
    } else {
      updateProjectMetadata({ title, artist });
    }
    sync.replaceLines(parsed.lines);
    setActiveTab('sync');
  };

  const handleNavSelect = (tab: 'catalog' | 'lyrics' | 'sync' | 'export') => {
    exitBurstIfNeeded();
    setSyncSubView('default');
    setActiveTab(tab);
  };

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
            onOpenCatalog={() => handleNavSelect('catalog')}
            onRetrySave={() => void flushPendingSave()}
          />
        ) : null}

        <main
          className={`flex-1 min-h-0 px-4 flex flex-col ${
            activeTab === 'sync' || activeTab === 'word' || activeTab === 'loupe'
              ? 'pb-1.5 [@media(max-height:720px)]:pb-1 overflow-hidden'
              : 'pb-3 [@media(max-height:720px)]:pb-1.5 overflow-y-auto'
          }`}
        >
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
              pausedTimeMs={player.isPlaying ? -1 : player.currentTime}
              getCurrentTimeMs={getCurrentTimeMs}
              onSelectMode={handleSelectMode}
              onTogglePlay={togglePlay}
              onSeek={seekTo}
              onUploadAudio={handleUploadAudio}
            />
          ) : null}

          {activeTab === 'sync' && syncSubView !== 'karaoke' ? (
            <LineSyncScreen
              hasAudio={Boolean(audioUrl)}
              peaks={waveformPeaks}
              currentTimeMs={player.currentTime}
              durationMs={durationMs}
              isPlaying={player.isPlaying}
              playbackRate={player.playbackRate}
              lines={sync.lines}
              activeLineIndex={sync.activeLineIndex}
              playingLineIndex={playingLineIndex}
              trackedListIndex={trackedListIndex}
              canUndo={sync.canUndo}
              syncMode={burstActive ? 'burst' : 'line'}
              burstWindow={burstWindow}
              onSelectMode={handleSelectMode}
              onSeek={player.seekTo}
              onSeekStart={() => player.setSeeking(true)}
              onSeekEnd={() => player.setSeeking(false)}
              onTogglePlay={player.togglePlay}
              onChangePlaybackRate={(rate) => {
                player.setPlaybackRate(rate);
                if (project) {
                  updateProjectMetadata({
                    settings: { ...project.settings, playbackRate: rate },
                  });
                }
              }}
              onUndo={() => {
                sync.undo();
              }}
              onSelectLine={(index) => {
                setManualOverrideAtPlayingIndex(player.isPlaying ? playingLineIndex : null);
                sync.setActiveLineIndex(index);
                sync.setActiveWordIndex(0);
                const selected = sync.lines[index];
                if (selected && selected.startMs !== null) {
                  player.seekTo(selected.startMs);
                }
              }}
              onStampLine={(nowMs) => {
                sync.stampLineStart(nowMs, false);
              }}
              onOpenLoupe={handleOpenLoupe}
              onStopBurst={() => {
                setSyncSubView('default');
                player.pause();
              }}
              onUploadAudio={handleUploadAudio}
            />
          ) : null}

          {activeTab === 'word' ? (
            <WordSyncScreen
              hasAudio={Boolean(audioUrl)}
              peaks={waveformPeaks}
              currentTimeMs={player.currentTime}
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
              onToggleSniper={() => {
                if (project) {
                  updateProjectMetadata({
                    settings: { ...project.settings, sniperMode: !sniperMode },
                  });
                }
              }}
              onToggleHold={() => setHoldMode((prev) => !prev)}
              onSeek={player.seekTo}
              onSeekStart={() => player.setSeeking(true)}
              onSeekEnd={() => player.setSeeking(false)}
              onPlay={player.play}
              onPause={player.pause}
              onStampWordStart={sync.stampWordStart}
              onStampWordEnd={sync.stampWordEnd}
              onOpenLoupe={handleOpenLoupe}
              onUploadAudio={handleUploadAudio}
            />
          ) : null}

          {activeTab === 'loupe' && activeLine ? (
            <LoupeScreen
              peaks={waveformPeaks}
              durationMs={durationMs}
              currentTimeMs={player.currentTime}
              line={activeLine}
              lineIndex={sync.activeLineIndex}
              lines={sync.lines}
              isSaved={saveStatus === 'saved' || saveStatus === 'idle'}
              onChange={handleLoupeBoundsChange}
              onPlayBurst={handleLoupePlayBurst}
              onApply={(bounds) => {
                handleLoupeBoundsChange(bounds);
                setActiveTab(loupeReturnTab);
              }}
              onBack={() => setActiveTab(loupeReturnTab)}
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
          {activeTab === 'catalog' || activeTab === 'lyrics' || activeTab === 'export' ? (
            <VersionFooter />
          ) : null}
        </main>

        {showNavBar ? (
          <NavBar
            items={NAV_ITEMS}
            activeId={navActiveId}
            onSelect={handleNavSelect}
            className="pt-1.5 pb-2.5 [&>button]:min-h-[48px] [@media(max-height:720px)]:pt-1 [@media(max-height:720px)]:pb-1.5 [@media(max-height:720px)]:[&>button]:min-h-[44px]"
          />
        ) : null}
      </div>
    </div>
  );
}
