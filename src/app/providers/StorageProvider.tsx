import { createContext, useContext, type ReactNode } from 'react';
import { storageService, type IStorageAdapter } from '@/storage';

const StorageContext = createContext<IStorageAdapter | null>(null);

export interface StorageProviderProps {
  adapter?: IStorageAdapter;
  children: ReactNode;
}

/**
 * Provee el adaptador de almacenamiento local-first (`storageService` por defecto)
 * a toda la jerarquía de la aplicación.
 */
export function StorageProvider({
  adapter = storageService,
  children,
}: StorageProviderProps) {
  return (
    <StorageContext.Provider value={adapter}>
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Devuelve el adaptador `IStorageAdapter` activo del contexto.
 */
export function useStorage(): IStorageAdapter {
  const adapter = useContext(StorageContext);
  if (!adapter) {
    throw new Error('useStorage debe usarse dentro de un StorageProvider.');
  }
  return adapter;
}
