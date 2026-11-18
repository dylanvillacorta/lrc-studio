import { Icon, type IconName } from './icons';

export interface NavBarItem<T extends string = string> {
  id: T;
  label: string;
  icon: IconName;
}

export interface NavBarProps<T extends string = string> {
  items: readonly NavBarItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  'aria-label'?: string;
  className?: string;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-1 focus-visible:ring-offset-bg';

/**
 * Navegación inferior móvil fija en la zona del pulgar (4 elementos).
 */
export function NavBar<T extends string = string>({
  items,
  activeId,
  onSelect,
  'aria-label': ariaLabel = 'Navegación principal',
  className = '',
}: NavBarProps<T>) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`px-3 pt-2.5 pb-5 flex justify-around rounded-t-[28px] bg-bg shadow-[0_-6px_16px_rgba(196,190,180,0.8)] flex-none ${className}`.trim()}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
            className={`min-w-[76px] min-h-[58px] px-2 rounded-[18px] flex flex-col items-center justify-center gap-1 text-[11.5px] font-extrabold cursor-pointer transition-colors ${
              active
                ? 'text-acc shadow-[inset_3px_3px_7px_var(--color-lo),inset_-3px_-3px_7px_var(--color-hi)]'
                : 'bg-transparent text-mute'
            } ${FOCUS_RING}`.trim()}
          >
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
