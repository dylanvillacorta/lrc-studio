import { useState } from 'react';
import type { ProjectSummary } from '@/types';
import { Icon, IconButton, Pill, ProgressBar, RaisedButton } from '@/ui';
import { formatRelativeDate } from '../model/catalogModel';

export interface ProjectCardProps {
  project: ProjectSummary;
  isActive?: boolean;
  now?: number;
  onOpen: (projectId: string) => void;
  onDuplicate: (projectId: string) => void;
  onExportBackup: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

function getStatusBadge(
  project: ProjectSummary,
  isActive: boolean,
): { label: string; variant: 'acc' | 'ok' | 'mute' } {
  if (isActive) {
    return { label: 'EN CURSO', variant: 'acc' };
  }
  if (project.lineProgress === 0 && project.wordProgress === 0) {
    return { label: 'NUEVA', variant: 'mute' };
  }
  if (project.lineProgress >= 100) {
    return { label: 'LÍNEAS ✓', variant: 'ok' };
  }
  return { label: 'EN PROGRESO', variant: 'mute' };
}

/**
 * Tarjeta de proyecto del catálogo «Mis transcripciones» con barras de progreso y acciones táctiles.
 */
export function ProjectCard({
  project,
  isActive = false,
  now,
  onOpen,
  onDuplicate,
  onExportBackup,
  onDelete,
}: ProjectCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const status = getStatusBadge(project, isActive);
  const primaryActionLabel =
    isActive || project.lineProgress > 0 || project.wordProgress > 0
      ? 'Continuar'
      : 'Abrir';
  const audioLabel = project.audioFileName
    ? `♪ ${project.audioFileName}`
    : 'Sin audio cargado';

  return (
    <article
      aria-label={project.title}
      className="relieve rounded-[24px] p-3.5 flex flex-col gap-2.5 flex-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-base font-extrabold text-ink truncate">
            {project.title}
          </h2>
          <p className="m-0 text-[13px] font-semibold text-mute truncate">
            {project.artist || 'Artista desconocido'}
          </p>
        </div>
        <Pill variant={status.variant} className="flex-none">
          {status.label}
        </Pill>
      </div>

      <div className="font-mono text-xs font-bold text-mute truncate">
        {audioLabel}
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-extrabold text-mute">
            <span>Líneas</span>
            <span className="font-mono tabular-nums">
              {`${project.syncedLines}/${project.totalLines} · ${project.lineProgress}%`}
            </span>
          </div>
          <ProgressBar
            value={project.lineProgress}
            variant="ok"
            label={`Progreso de líneas de ${project.title}`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-extrabold text-mute">
            <span>Palabras</span>
            <span className="font-mono tabular-nums">{`${project.wordProgress}%`}</span>
          </div>
          <ProgressBar
            value={project.wordProgress}
            variant="acc"
            label={`Progreso de palabras de ${project.title}`}
          />
        </div>
      </div>

      {confirmingDelete ? (
        <div
          role="alertdialog"
          aria-label={`Confirmar eliminación de ${project.title}`}
          className="hundido rounded-[18px] p-3 flex flex-col gap-2.5"
        >
          <p className="m-0 text-[13px] font-bold text-ink">
            ¿Eliminar «{project.title}» de este dispositivo?
          </p>
          <div className="flex items-center gap-2.5">
            <RaisedButton
              size="sm"
              className="flex-1"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancelar
            </RaisedButton>
            <RaisedButton
              size="sm"
              variant="acc"
              className="flex-1"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete(project.id);
              }}
            >
              Sí, eliminar
            </RaisedButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <RaisedButton
            size="sm"
            variant="acc"
            className="flex-1"
            onClick={() => onOpen(project.id)}
          >
            {primaryActionLabel}
          </RaisedButton>
          <IconButton
            aria-label="Duplicar"
            onClick={() => onDuplicate(project.id)}
          >
            <Icon name="copy" size={20} />
          </IconButton>
          <IconButton
            aria-label="Exportar respaldo .json"
            onClick={() => onExportBackup(project.id)}
          >
            <Icon name="download" size={20} />
          </IconButton>
          <IconButton
            aria-label="Eliminar"
            className="text-acc"
            onClick={() => setConfirmingDelete(true)}
          >
            <Icon name="trash" size={20} />
          </IconButton>
        </div>
      )}

      <div className="text-xs font-semibold text-mute">
        {`Editada ${formatRelativeDate(project.updatedAt, now)}`}
      </div>
    </article>
  );
}
