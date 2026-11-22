import { DesktopLayout } from '@/app/layouts/DesktopLayout';
import { MobileLayout } from '@/app/layouts/MobileLayout';
import { ActiveProjectProvider, StorageProvider } from '@/app/providers';
import { useEffect } from 'react';
import { installNativeFeel } from '@/lib/nativeFeel';
import { useIsDesktop } from '@/lib/useIsDesktop';

function ResponsiveLayout() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopLayout /> : <MobileLayout />;
}

/**
 * Raíz de la aplicación LRC Studio.
 */
export function App() {
  useEffect(() => installNativeFeel(), []);
  return (
    <StorageProvider>
      <ActiveProjectProvider>
        <ResponsiveLayout />
      </ActiveProjectProvider>
    </StorageProvider>
  );
}
