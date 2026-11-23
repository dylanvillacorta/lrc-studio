import { memo } from 'react';
import { Icon, IconButton } from '@/ui';

export interface LineRowActionBarProps {
  isSynced: boolean;
  onPlayFromHere?: () => void;
  onClearMark?: () => void;
}

/**
 * Barra compacta de acciones para la línea seleccionada (objetivos ≥ 44 px, sin crecer la fila).
 */
export const LineRowActionBar = memo(function LineRowActionBar({
  isSynced,
  onPlayFromHere,
  onClearMark,
}: LineRowActionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Acciones de línea"
      className="flex items-center gap-1 shrink-0"
    >
      {isSynced && onPlayFromHere ? (
        <IconButton
          aria-label="Reproducir desde aquí"
          onClick={onPlayFromHere}
          className="min-h-11 min-w-11 h-11 w-11 rounded-[10px] text-acc shrink-0"
        >
          <Icon name="play" size={16} />
        </IconButton>
      ) : null}

      {isSynced && onClearMark ? (
        <IconButton
          aria-label="Borrar marca"
          onClick={onClearMark}
          className="min-h-11 min-w-11 h-11 w-11 rounded-[10px] text-ink shrink-0"
        >
          <Icon name="trash" size={16} />
        </IconButton>
      ) : null}
    </div>
  );
});
