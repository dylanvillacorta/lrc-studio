export interface VersionFooterProps {
  version?: string;
  commit?: string;
}

export function VersionFooter({
  version = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.0.0',
  commit = typeof APP_COMMIT !== 'undefined' ? APP_COMMIT : 'dev',
}: VersionFooterProps) {
  return (
    <footer className="py-2 text-center font-mono text-xs text-[var(--ink-3)]">
      <span>
        v{version} ({commit})
      </span>
    </footer>
  );
}
