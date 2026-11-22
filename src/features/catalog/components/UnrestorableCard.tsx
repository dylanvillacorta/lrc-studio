import { memo, useState } from 'react';
import type { UnrestorableProject } from '@/types';
import { Icon, Pill, RaisedButton } from '@/ui';

export interface UnrestorableCardProps {
  item: UnrestorableProject;
  onDownloadOriginal: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

/**
 * Tarjeta de un registro guardado que no se puede restaurar. No se puede abrir; solo descargar el JSON
 * original o, con confirmación explícita, eliminarlo.
 */
export const UnrestorableCard = memo(function UnrestorableCard({
  item,
  onDownloadOriginal,
  onDelete,
}: UnrestorableCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const label = item.title ?? item.id;

  return (
    <article
      aria-label={`No se puede restaurar ${label}`}
      data-testid="unrestorable-card"
      className="relieve rounded-[24px] p-3.5 flex flex-col gap-2.5 flex-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-base font-extrabold text-ink truncate">{label}</h2>
          <p className="m-0 text-[13px] font-semibold text-acc">
            No se puede restaurar
          </p>
        </div>
        <Pill variant="mute" className="flex-none">
          BLOQUEADA
        </Pill>
      </div>

      <p role="alert" className="m-0 text-xs font-semibold text-mute break-words">
        {item.reason}. Tus datos siguen guardados sin cambios.
      </p>

      {confirmingDelete ? (
        <div
          role="alertdialog"
          aria-label={`Confirmar eliminación de ${label}`}
          className="hundido rounded-[18px] p-3 flex flex-col gap-2.5"
        >
          <p className="m-0 text-[13px] font-bold text-ink">
            ¿Eliminar «{label}» de este dispositivo? Descarga el original antes si quieres conservarlo.
          </p>
          <div className="flex items-center gap-2.5">
            <RaisedButton size="sm" className="flex-1" onClick={() => setConfirmingDelete(false)}>
              Cancelar
            </RaisedButton>
            <RaisedButton
              size="sm"
              variant="acc"
              className="flex-1"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete(item.id);
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
            aria-label={`Descargar original de ${label}`}
            onClick={() => onDownloadOriginal(item.id)}
          >
            <Icon name="download" size={18} />
            <span>Descargar original</span>
          </RaisedButton>
          <RaisedButton
            size="sm"
            className="flex-none text-acc"
            aria-label={`Eliminar ${label}`}
            onClick={() => setConfirmingDelete(true)}
          >
            <Icon name="trash" size={18} />
          </RaisedButton>
        </div>
      )}
    </article>
  );
});
