import type { DesktopCenterView } from '@/app/layouts/DesktopHeader';
import { CatalogPanel, type UseCatalogResult } from '@/features/catalog';
import { ExportScreen, type ParsedProjectJson } from '@/features/export';
import { LoupeScreen, type LineBounds } from '@/features/loupe';
import {
  LyricsScreen,
  mergeRawTextWithExistingLines,
} from '@/features/lyrics';
import { downloadTextFile } from '@/lib/download';
import type { ActiveTab, LyricLine, ProjectFullData } from '@/types';

export interface DesktopSecondaryViewProps {
  centerView: Exclude<DesktopCenterView, 'editor'>;
  project: ProjectFullData | null;
  catalog: UseCatalogResult;
  lines: LyricLine[];
  activeLineIndex: number;
  waveformPeaks: number[];
  durationMs: number;
  currentTimeMs: number;
  isSaved: boolean;
  loupeReturnTab: 'sync' | 'word';
  onOpenProject: (id: string) => Promise<void>;
  onCreateProject: (input?: { title?: string; artist?: string }) => Promise<unknown>;
  onDeleteProject: (id: string) => Promise<void>;
  onUpdateMetadata: (
    patch: Partial<Pick<ProjectFullData, 'title' | 'artist' | 'settings'>>,
  ) => void;
  onReplaceLines: (nextLines: LyricLine[], recordHistory?: boolean) => void;
  onLoadDemo: () => Promise<void>;
  onImportJson: (parsed: ParsedProjectJson) => Promise<void>;
  onChangeLoupeBounds: (bounds: LineBounds) => void;
  onPlayLoupeBurst: () => void;
  onSetActiveTab: (tab: ActiveTab) => void;
}

/**
 * Renderiza las vistas secundarias en el panel central de escritorio
 * (Catálogo completo, Letra, Exportar y Lupa).
 */
export function DesktopSecondaryView({
  centerView,
  project,
  catalog,
  lines,
  activeLineIndex,
  waveformPeaks,
  durationMs,
  currentTimeMs,
  isSaved,
  loupeReturnTab,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  onUpdateMetadata,
  onReplaceLines,
  onLoadDemo,
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
      <div className="relieve rounded-[26px] p-5 flex-1 min-h-0 overflow-y-auto">
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
          onLoadDemo={onLoadDemo}
        />
      </div>
    );
  }

  if (centerView === 'export') {
    return (
      <div className="relieve rounded-[26px] p-5 flex-1 min-h-0 overflow-y-auto">
        {project ? (
          <ExportScreen project={project} onImport={onImportJson} />
        ) : (
          <p className="m-0 text-sm font-bold text-mute text-center py-8">
            Abre o crea una transcripción para exportar sus marcas LRC, ELRC o JSON.
          </p>
        )}
      </div>
    );
  }

  const activeLine = lines[activeLineIndex];
  if (!activeLine) {
    return null;
  }

  return (
    <div className="relieve rounded-[26px] p-5 flex-1 min-h-0 overflow-y-auto">
      <LoupeScreen
        peaks={waveformPeaks}
        durationMs={durationMs}
        currentTimeMs={currentTimeMs}
        line={activeLine}
        lineIndex={activeLineIndex}
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
    </div>
  );
}
