import { useMemo, useState } from 'react';
import type { ProjectSummary } from '@/types';
import { Icon, IconButton, RaisedButton, WellPanel } from '@/ui';
import { filterProjectsByQuery } from '../model/catalogModel';
import { ProjectCard } from './ProjectCard';

export interface CatalogPanelProps {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  loading?: boolean;
  error?: string | null;
  now?: number;
  onOpen: (projectId: string) => void;
  onCreate: () => void;
  onDuplicate: (projectId: string) => void;
  onExportBackup: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onClose?: () => void;
}

/**
 * Pantalla del catálogo «Mis transcripciones» con buscador, creación y lista de tarjetas.
 */
export function CatalogPanel({
  projects,
  activeProjectId,
  loading = false,
  error = null,
  now,
  onOpen,
  onCreate,
  onDuplicate,
  onExportBackup,
  onDelete,
  onClose,
}: CatalogPanelProps) {
  const [query, setQuery] = useState('');

  const filteredProjects = useMemo(
    () => filterProjectsByQuery(projects, query),
    [projects, query],
  );

  const countLabel =
    projects.length === 1 ? '1 canción' : `${projects.length} canciones`;

  return (
    <section
      aria-label="Mis transcripciones"
      className="flex flex-col gap-4 h-full min-h-0 bg-bg text-ink p-4"
    >
      <header className="flex items-center gap-3">
        <IconButton
          aria-label="Cerrar catálogo"
          onClick={onClose}
          disabled={!onClose}
        >
          <Icon name="back" size={22} />
        </IconButton>
        <div className="flex-1 min-w-0">
          <h1 className="m-0 text-lg font-extrabold text-ink truncate">
            Mis transcripciones
          </h1>
          <p className="m-0 text-xs font-semibold text-mute truncate">
            {countLabel} · todo guardado en este dispositivo
          </p>
        </div>
      </header>

      <div className="flex items-center gap-3">
        <label className="hundido flex-1 min-h-[52px] flex items-center gap-2.5 px-4 rounded-[18px] text-mute">
          <Icon name="search" size={20} className="flex-none" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar título o artista"
            aria-label="Buscar título o artista"
            className="w-full min-h-12 bg-transparent text-sm font-semibold text-ink placeholder:text-mute focus:outline-none"
          />
        </label>

        <RaisedButton
          variant="acc"
          size="sm"
          aria-label="Nueva transcripción"
          onClick={onCreate}
          className="min-h-[52px] rounded-[18px] px-4 flex-none"
        >
          <Icon name="plus" size={20} />
          <span>Nueva</span>
        </RaisedButton>
      </div>

      {error ? (
        <WellPanel role="alert" className="text-sm font-bold text-acc">
          {error}
        </WellPanel>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 p-0.5">
        {loading && projects.length === 0 ? (
          <WellPanel className="text-center py-8 px-4 text-sm font-semibold text-mute">
            Cargando transcripciones...
          </WellPanel>
        ) : projects.length === 0 ? (
          <WellPanel className="text-center py-8 px-4 flex flex-col items-center gap-1.5">
            <p className="m-0 text-sm font-extrabold text-ink">
              Aún no tienes transcripciones guardadas.
            </p>
            <p className="m-0 text-xs font-semibold text-mute">
              Toca «Nueva» para empezar tu primera canción.
            </p>
          </WellPanel>
        ) : filteredProjects.length === 0 ? (
          <WellPanel className="text-center py-6 px-4 text-sm font-semibold text-mute">
            No se encontraron canciones para «{query.trim()}».
          </WellPanel>
        ) : (
          filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={project.id === activeProjectId}
              now={now}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
              onExportBackup={onExportBackup}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </section>
  );
}
