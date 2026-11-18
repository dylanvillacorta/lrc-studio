import type { SaveStatus } from '@/features/session';
import type { SyncSegmentedMode } from '@/features/sync/components/syncViewHelpers';
import { Icon, Pill, RaisedButton, Segmented, type SegmentedOption } from '@/ui';

export type DesktopSyncMode = 'line' | 'word' | 'burst' | 'karaoke';
export type DesktopCenterView = 'editor' | 'lyrics' | 'export' | 'catalog' | 'loupe';

const DESKTOP_MODE_OPTIONS: readonly SegmentedOption<DesktopSyncMode>[] = [
  { value: 'line', label: 'Línea' },
  { value: 'word', label: 'Palabra' },
  { value: 'burst', label: 'Ráfaga' },
  { value: 'karaoke', label: 'Karaoke' },
];

export interface DesktopHeaderProps {
  syncMode: DesktopSyncMode;
  centerView: DesktopCenterView;
  saveStatus: SaveStatus;
  onSelectSyncMode: (mode: SyncSegmentedMode) => void;
  onToggleLyrics: () => void;
  onToggleExport: () => void;
  onRetrySave: () => void;
}

/**
 * Barra superior del estudio en escritorio: marca, selector de modo,
 * acceso a Letra/Exportar e indicador de autoguardado.
 */
export function DesktopHeader({
  syncMode,
  centerView,
  saveStatus,
  onSelectSyncMode,
  onToggleLyrics,
  onToggleExport,
  onRetrySave,
}: DesktopHeaderProps) {
  const isSaving = saveStatus === 'saving' || saveStatus === 'pending';

  return (
    <header className="flex flex-wrap items-center gap-3 min-[1100px]:gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          aria-hidden="true"
          className="w-12 h-12 rounded-full boton grid place-items-center text-acc shrink-0"
        >
          <Icon name="sync" size={22} />
        </div>
        <h1 className="m-0 text-[18px] font-extrabold tracking-tight text-ink truncate">
          LyricSync Studio
        </h1>
      </div>

      <div className="flex-1 min-w-4" />

      <Segmented
        options={DESKTOP_MODE_OPTIONS}
        value={syncMode}
        onChange={(mode) => onSelectSyncMode(mode)}
        aria-label="Modo de sincronización"
        className="w-[300px] sm:w-[340px] max-w-full"
      />

      <RaisedButton
        size="sm"
        variant={centerView === 'lyrics' ? 'acc' : 'default'}
        aria-pressed={centerView === 'lyrics'}
        onClick={onToggleLyrics}
        className="min-h-12"
      >
        <Icon name="lines" size={18} />
        <span>Letra</span>
      </RaisedButton>

      {saveStatus === 'error' ? (
        <button
          type="button"
          onClick={onRetrySave}
          className="min-h-12 px-3 rounded-[14px] hundido text-acc text-xs font-extrabold flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-acc" />
          <span>Error · Reintentar</span>
        </button>
      ) : (
        <Pill variant={isSaving ? 'mute' : 'ok'} className="h-9 px-3 rounded-[14px]">
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full ${isSaving ? 'bg-warn' : 'bg-ok'}`}
          />
          <span>{isSaving ? 'Guardando' : 'Guardado'}</span>
        </Pill>
      )}

      <RaisedButton
        size="sm"
        variant={centerView === 'export' ? 'acc' : 'default'}
        aria-pressed={centerView === 'export'}
        onClick={onToggleExport}
        className="min-h-12"
      >
        <Icon name="export" size={18} />
        <span>Exportar LRC / ELRC / JSON</span>
      </RaisedButton>
    </header>
  );
}
