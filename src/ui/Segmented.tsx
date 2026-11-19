export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string = string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
  className?: string;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-1 focus-visible:ring-offset-bg';

/**
 * Selector segmentado hundido con pestaña activa en relieve.
 */
export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className = '',
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`hundido flex p-1.5 gap-1 rounded-[20px] ${className}`.trim()}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 min-h-12 px-3 rounded-[15px] text-sm cursor-pointer transition-colors ${
              active
                ? 'boton text-ink font-extrabold'
                : 'bg-transparent text-mute font-bold'
            } ${FOCUS_RING}`.trim()}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
