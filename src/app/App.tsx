import { MobileLayout } from '@/app/layouts/MobileLayout';
import { ActiveProjectProvider, StorageProvider } from '@/app/providers';

/**
 * Raíz de la aplicación LyricSync Studio.
 */
export function App() {
  return (
    <StorageProvider>
      <ActiveProjectProvider>
        <MobileLayout />
      </ActiveProjectProvider>
    </StorageProvider>
  );
}
