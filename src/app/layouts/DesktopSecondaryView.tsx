import { memo } from 'react';
import type { DesktopCenterView } from '@/app/layouts/DesktopHeader';
import { CatalogPanel, type UseCatalogResult } from '@/features/catalog';
import { ExportScreen, type ParsedProjectJson } from '@/features/export';
import { LoupeScreen, type LineBounds } from '@/features/loupe';
import {
  LyricsScreen,
  mergeRawTextWithExistingLines,
} from '@/features/lyrics';
import {
  usePlaybackTime,
  type PlaybackTimeStore,
} from '@/features/sync/hooks/playbackTimeStore';
import { downloadTextFile } from '@/lib/download';
import type { ActiveTab, LyricLine, ProjectFullData } from '@/types';
import { ScrollShadow } from '@/ui';

export interface DesktopSecondaryViewProps {
  centerView: Exclude<DesktopCenterView, 'editor'>;
  project: ProjectFullData | null;
  catalog: UseCatalogResult;
  lines: LyricLine[];
  activeLineIndex: number;
  waveformPeaks: number[];
  durationMs: number;
  timeStore?: PlaybackTimeStore | null;
  currentTimeMs?: number;
  isSaved: boolean;
  loupeReturnTab: 'sync' | 'word';
  onOpenProject: (id: string) => Promise<void>;
  onCreateProject: (input?: { title?: string; artist?: string }) => Promise<unknown>;
  onDeleteProject: (id: string) => Promise<void>;
  onUpdateMetadata: (
    patch: Partial<Pick<ProjectFullData, 'title' | 'artist' | 'settings'>>,
  ) => void;
  onReplaceLines: (nextLines: LyricLine[], recordHistory?: boolean) => void;
  onImportJson: (parsed: ParsedProjectJson) => Promise<void>;
  onChangeLoupeBounds: (bounds: LineBounds) => void;
  onPlayLoupeBurst: () => void;
  onSetActiveTab: (tab: ActiveTab) => void;
}

const DesktopLoupeBridge = memo(function DesktopLoupeBridge({
  peaks,
  durationMs,
  timeStore,
  fallbackTimeMs,
  line,
  lineIndex,
  lines,
  isSaved,
  loupeReturnTab,
  onChangeLoupeBounds,
  onPlayLoupeBurst,
  onSetActiveTab,
}: {
  peaks: number[];
  durationMs: number;
  timeStore: PlaybackTimeStore | null;
  fallbackTimeMs: number;
  line: LyricLine;
  lineIndex: number;
  lines: LyricLine[];
  isSaved: boolean;
  loupeReturnTab: 'sync' | 'word';
  onChangeLoupeBounds: (bounds: LineBounds) => void;
  onPlayLoupeBurst: () => void;
  onSetActiveTab: (tab: ActiveTab) => void;
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
      onChange={onChangeLoupeBounds}
      onPlayBurst={onPlayLoupeBurst}
      onApply={(bounds) => {
        onChangeLoupeBounds(bounds);
        onSetActiveTab(loupeReturnTab);
      }}
      onBack={() => onSetActiveTab(loupeReturnTab)}
    />
  );
});

/**
 * Renderiza las vistas secundarias en el panel central de escritorio
 * (Catálogo completo, Letra, Exportar y Lupa).
 */
export const DesktopSecondaryView = memo(function DesktopSecondaryView({
  centerView,
  project,
  catalog,
  lines,
  activeLineIndex,
  waveformPeaks,
  durationMs,
  timeStore = null,
  currentTimeMs = 0,
  isSaved,
  loupeReturnTab,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  onUpdateMetadata,
  onReplaceLines,
  onImportJson,
  onChangeLoupeBounds,
  onPlayLoupeBurst,
  onSetActiveTab,
}: DesktopSecondaryViewProps) {
  if (centerView === 'catalog') {
    return (
      <div className="relieve rounded-[26px] overflow-hidden flex-1 min-h-0">
        <CatalogPanel
          projects={catalog.projects}
          activeProjectId={project?.id ?? null}
          loading={catalog.loading}
          error={catalog.error}
          headingLevel={2}
          onOpen={async (id) => {
            await onOpenProject(id);
            onSetActiveTab('sync');
          }}
          onCreate={async () => {
            await onCreateProject();
            onSetActiveTab('sync');
          }}
          onDuplicate={(id) => void catalog.duplicateProject(id)}
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
          onDelete={(id) => void onDeleteProject(id)}
          onClose={() => onSetActiveTab('sync')}
        />
      </div>
    );
  }

  if (centerView === 'lyrics') {
    return (
      <ScrollShadow
        className="relieve rounded-[26px] flex-1 min-h-0 overflow-hidden"
        contentClassName="p-5"
      >
        <LyricsScreen
          title={project?.title ?? ''}
          artist={project?.artist ?? ''}
          rawText={lines.map((l) => l.text).join('\n')}
          existingLines={lines}
          onTitleChange={async (title) => {
            if (!project) {
              await onCreateProject({ title, artist: '' });
              return;
            }
            onUpdateMetadata({ title });
          }}
          onArtistChange={async (artist) => {
            if (!project) {
              await onCreateProject({ title: 'Sin título', artist });
              return;
            }
            onUpdateMetadata({ artist });
          }}
          onApply={async (rawText) => {
            if (!project) {
              await onCreateProject();
            }
            onReplaceLines(mergeRawTextWithExistingLines(rawText, lines));
          }}
        />
      </ScrollShadow>
    );
  }

  if (centerView === 'export') {
    return (
      <ScrollShadow
        className="relieve rounded-[26px] flex-1 min-h-0 overflow-hidden"
        contentClassName="p-5"
      >
        {project ? (
          <ExportScreen project={project} onImport={onImportJson} />
        ) : (
          <p className="m-0 text-sm font-bold text-mute text-center py-8">
            Abre o crea una transcripción para exportar sus marcas LRC, ELRC o JSON.
          </p>
        )}
      </ScrollShadow>
    );
  }

  const activeLine = lines[activeLineIndex];
  if (!activeLine) {
    return null;
  }

  return (
    <div className="relieve rounded-[26px] p-5 flex-1 min-h-0 overflow-y-auto">
      <DesktopLoupeBridge
        peaks={waveformPeaks}
        durationMs={durationMs}
        timeStore={timeStore}
        fallbackTimeMs={currentTimeMs}
        line={activeLine}
        lineIndex={activeLineIndex}
        lines={lines}
        isSaved={isSaved}
        loupeReturnTab={loupeReturnTab}
        onChangeLoupeBounds={onChangeLoupeBounds}
        onPlayLoupeBurst={onPlayLoupeBurst}
        onSetActiveTab={onSetActiveTab}
      />
    </div>
  );
});
