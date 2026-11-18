import type { SVGProps } from 'react';

export type IconName =
  | 'library'
  | 'lines'
  | 'sync'
  | 'export'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'forward'
  | 'undo'
  | 'replay'
  | 'copy'
  | 'download'
  | 'trash'
  | 'plus'
  | 'search'
  | 'check'
  | 'back'
  | 'menu';

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const PATHS: Record<IconName, string> = {
  library: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
  lines: 'M4 6h16M4 12h16M4 18h10',
  sync: 'M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83',
  export: 'M12 3v12m0-12 4 4m-4-4-4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  play: 'M6 4l14 8-14 8V4z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  rewind: 'M11 19l-9-7 9-7v14zm11 0-9-7 9-7v14z',
  forward: 'M13 5l9 7-9 7V5zM2 5l9 7-9 7V5z',
  undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-6.7L3 9',
  replay: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5',
  copy: 'M8 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M10 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35',
  check: 'M20 6 9 17l-5-5',
  back: 'M15 18l-6-6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
};

/**
 * Icono SVG propio de «Estudio táctil» (24x24, trazo 2, aria-hidden).
 */
export function Icon({ name, size = 22, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
