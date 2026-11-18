import type { HTMLAttributes } from 'react';

export type KeycapProps = HTMLAttributes<HTMLElement>;

/**
 * Tecla física con bisel inferior para mostrar atajos en escritorio.
 */
export function Keycap({ className = '', children, ...props }: KeycapProps) {
  return (
    <kbd
      className={`min-w-[38px] h-[34px] px-2.5 rounded-[10px] inline-grid place-items-center font-mono text-[13px] font-bold text-ink bg-bg shadow-[0_3px_0_var(--color-lo),3px_5px_9px_var(--color-lo),-2px_-2px_6px_var(--color-hi)] ${className}`.trim()}
      {...props}
    >
      {children}
    </kbd>
  );
}
