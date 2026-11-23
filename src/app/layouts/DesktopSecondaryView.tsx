import { memo } from 'react';
import type { DesktopCenterView } from '@/app/layouts/DesktopHeader';
import { CatalogPanel, type UseCatalogResult } from '@/features/catalog';
import { ExportScreen, type ParsedProjectJson } from '@/features/export';
import {
  LyricsScreen,
  mergeRawTextWithExistingLines,
} from '@/features/lyrics';
import { downloadTextFile } from '@/lib/download';
import type { ActiveTab, LyricLine, ProjectFullData } from '@/types';
import { ScrollShadow } from '@/ui';

export interface DesktopSecondaryViewProps {
  centerView: Exclude<DesktopCenterView, 'editor'>;
  project: ProjectFullData | null;
  catalog: UseCatalogResult;
  lines: LyricLine[];
  onOpenProject: (id: string) => Promise<void>;
  onCreateProject: (input?: { title?: string; artist?: string }) => Promise<unknown>;
  onDeleteProject: (id: string) => Promise<void>;
  onUpdateMetadata: (
    patch: Partial<Pick<ProjectFullData, 'title' | 'artist' | 'settings'>>,
  ) => void;
  onReplaceLines: (nextLines: LyricLine[], recordHistory?: boolean) => void;
  onImportJson: (parsed: ParsedProjectJson) => Promise<void>;
  onSetActiveTab: (tab: ActiveTab) => void;
}

/**
 * Renderiza las vistas secundarias en el panel central de escritorio
 * (Catálogo completo, Letra y Exportar).
 */
export const DesktopSecondaryView = memo(function DesktopSecondaryView({
  centerView,
  project,
  catalog,
  lines,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  onUpdateMetadata,
  onReplaceLines,
  onImportJson,
  onSetActiveTab,
}: DesktopSecondaryViewProps) {
  if (centerView === 'catalog') {
    return (
      <div className="relieve rounded-[26px] overflow-hidden flex-1 min-h-0">
        <CatalogPanel
          projects={catalog.projects}
          unrestorable={catalog.unrestorable}
          onDownloadOriginal={async (id) => {
            const raw = await catalog.exportRawProject(id);
            if (raw) {
              downloadTextFile(raw.fileName, raw.json, 'application/json;charset=utf-8');
            }
          }}
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
});
