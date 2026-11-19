import type { ButtonHTMLAttributes } from 'react';

export interface RaisedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'acc';
  size?: 'md' | 'sm';
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Botón neumórfico estándar de «Estudio táctil».
 */
export function RaisedButton({
  variant = 'default',
  size = 'md',
  type = 'button',
  className = '',
  children,
  ...props
}: RaisedButtonProps) {
  const sizeClass =
    size === 'sm'
      ? 'min-h-12 px-3.5 rounded-[15px] text-[13px] shadow-[var(--shadow-boton)]'
      : 'min-h-14 px-[18px] rounded-[20px] text-[15px] shadow-[var(--shadow-boton-xl)]';

  const variantClass =
    variant === 'acc'
      ? 'text-white bg-[linear-gradient(145deg,#C8452D,#A93219)]'
      : 'bg-bg text-ink';

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2.5 font-extrabold cursor-pointer transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${sizeClass} ${variantClass} ${FOCUS_RING} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
