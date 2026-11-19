import type { ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  size?: 'md' | 'xl';
  active?: boolean;
  round?: boolean;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Botón de icono cuadrado o redondo con objetivo táctil mínimo de 48 px.
 */
export function IconButton({
  size = 'md',
  active = false,
  round = false,
  type = 'button',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  const sizeClass = size === 'xl' ? 'w-16 h-16' : 'w-12 h-12';
  const radiusClass = round ? 'rounded-full' : 'rounded-2xl';
  const elevationClass = active
    ? 'shadow-[inset_3px_3px_7px_var(--color-lo),inset_-3px_-3px_7px_var(--color-hi)] text-acc font-extrabold'
    : size === 'xl'
      ? 'shadow-[var(--shadow-boton-xl)] text-ink'
      : 'shadow-[var(--shadow-boton)] text-ink';

  return (
    <button
      type={type}
      aria-pressed={active}
      className={`grid place-items-center flex-none bg-bg cursor-pointer transition-transform active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${sizeClass} ${radiusClass} ${elevationClass} ${FOCUS_RING} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
