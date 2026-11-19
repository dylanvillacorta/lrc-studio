import type { HTMLAttributes, Ref } from 'react';

export interface WellPanelProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

/**
 * Contenedor hundido para áreas de lectura, listas de letras, onda o métricas.
 */
export function WellPanel({ className = '', children, ...props }: WellPanelProps) {
  return (
    <div
      className={`hundido rounded-[22px] p-3.5 ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
