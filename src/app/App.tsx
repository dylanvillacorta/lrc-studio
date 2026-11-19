import { DesktopLayout } from '@/app/layouts/DesktopLayout';
import { MobileLayout } from '@/app/layouts/MobileLayout';
import { ActiveProjectProvider, StorageProvider } from '@/app/providers';
import { useIsDesktop } from '@/lib/useIsDesktop';

function ResponsiveLayout() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopLayout /> : <MobileLayout />;
}

/**
 * Raíz de la aplicación LyricSync Studio.
 */
export function App() {
  return (
    <StorageProvider>
      <ActiveProjectProvider>
        <ResponsiveLayout />
      </ActiveProjectProvider>
    </StorageProvider>
  );
}
