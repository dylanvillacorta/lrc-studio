import { memo } from 'react';
import type { SaveStatus } from '@/features/session';
import { Icon, IconButton, Pill } from '@/ui';

export interface MobileHeaderProps {
  title: string;
  subtitle: string;
  saveStatus: SaveStatus;
  onOpenCatalog: () => void;
  onRetrySave: () => void;
  onOpenSettings?: () => void;
  onOpenInfo?: () => void;
}

/**
 * Cabecera móvil con acceso al catálogo, metadatos del proyecto e indicador de autoguardado.
 */
export const MobileHeader = memo(function MobileHeader({
  title,
  subtitle,
  saveStatus,
  onOpenCatalog,
  onRetrySave,
  onOpenSettings,
  onOpenInfo,
}: MobileHeaderProps) {
  const isSaving = saveStatus === 'saving' || saveStatus === 'pending';

  return (
    <header className="px-4 pt-2 pb-1 [@media(max-height:720px)]:pt-1 [@media(max-height:720px)]:pb-0.5 flex items-center gap-2.5 flex-none">
      <IconButton
        aria-label="Abrir Mis transcripciones"
        onClick={onOpenCatalog}
      >
        <Icon name="menu" size={20} />
      </IconButton>

      <div className="flex-1 min-w-0">
        <h1 className="m-0 text-[16px] font-extrabold tracking-tight truncate">
          {title}
        </h1>
        <p className="m-0 text-xs font-semibold text-mute truncate">
          {subtitle}
        </p>
      </div>

      {saveStatus === 'error' ? (
        <button
          type="button"
          onClick={onRetrySave}
          className="min-h-12 px-3 rounded-full hundido text-acc text-xs font-extrabold flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-acc" />
          <span>Error · Reintentar</span>
        </button>
      ) : (
        <Pill variant={isSaving ? 'mute' : 'ok'}>
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full ${isSaving ? 'bg-warn' : 'bg-ok'}`}
          />
          <span>{isSaving ? 'Guardando' : 'Guardado'}</span>
        </Pill>
      )}

      {onOpenSettings ? (
        <IconButton
          aria-label="Ajustes de sincronización"
          onClick={onOpenSettings}
        >
          <Icon name="settings" size={20} />
        </IconButton>
      ) : null}

      {onOpenInfo ? (
        <IconButton
          aria-label="Información de la aplicación"
          onClick={onOpenInfo}
        >
          <Icon name="info" size={20} />
        </IconButton>
      ) : null}
    </header>
  );
});
