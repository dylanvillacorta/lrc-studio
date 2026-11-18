import { memo } from 'react';
import type { ProjectSummary } from '@/types';
import { Icon, ProgressBar, RaisedButton, WellPanel } from '@/ui';

export interface DesktopCatalogSidebarProps {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  loading?: boolean;
  onOpen: (projectId: string) => void;
  onCreate: () => void;
  onOpenFullCatalog: () => void;
}

/**
 * Columna izquierda de escritorio con el catálogo compacto «Mis transcripciones»
 * y acceso directo a «Nueva transcripción».
 */
export const DesktopCatalogSidebar = memo(function DesktopCatalogSidebar({
  projects,
  activeProjectId,
  loading = false,
  onOpen,
  onCreate,
  onOpenFullCatalog,
}: DesktopCatalogSidebarProps) {
  return (
    <aside
      aria-label="Mis transcripciones"
      className="relieve rounded-[26px] p-[18px] flex flex-col gap-3 min-[1100px]:w-[280px] min-[1100px]:flex-none min-w-0"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[15px] font-extrabold text-ink">
          Mis transcripciones
        </h2>
        <button
          type="button"
          onClick={onOpenFullCatalog}
          aria-label="Gestionar catálogo completo"
          className="min-h-9 px-2.5 rounded-[12px] text-xs font-extrabold text-mute hover:text-ink transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          Gestionar
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 p-0.5 max-h-[340px] min-[1100px]:max-h-none">
        {loading && projects.length === 0 ? (
          <WellPanel className="p-4 text-center text-xs font-semibold text-mute">
            Cargando transcripciones...
          </WellPanel>
        ) : projects.length === 0 ? (
          <WellPanel className="p-4 text-center text-xs font-semibold text-mute">
            Aún no tienes transcripciones. Crea una para empezar.
          </WellPanel>
        ) : (
          projects.map((item) => {
            const isActive = item.id === activeProjectId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`w-full min-h-12 p-3 rounded-[16px] flex flex-col gap-2 text-left transition-shadow motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                  isActive ? 'hundido' : 'boton'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-ink truncate">
                    {item.title || 'Sin título'}
                  </div>
                  <div className="text-xs font-semibold text-mute truncate">
                    {item.artist || 'Sin artista'}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <ProgressBar
                    value={item.lineProgress}
                    variant="ok"
                    label={`Progreso de líneas de ${item.title || 'Sin título'}: ${item.lineProgress}%`}
                  />
                  <ProgressBar
                    value={item.wordProgress}
                    variant="acc"
                    label={`Progreso de palabras de ${item.title || 'Sin título'}: ${item.wordProgress}%`}
                  />
                </div>
              </button>
            );
          })
        )}
      </div>

      <RaisedButton
        variant="acc"
        onClick={onCreate}
        className="w-full mt-auto"
      >
        <Icon name="plus" size={20} />
        <span>Nueva transcripción</span>
      </RaisedButton>
    </aside>
  );
});
