import { useCallback, useEffect, useState } from 'react';
import { storageService, type IStorageAdapter } from '@/storage';
import type { ProjectFullData, ProjectSummary } from '@/types';
import {
  createCatalogProject,
  deleteCatalogProject,
  duplicateCatalogProject,
  exportCatalogProjectBackup,
  importCatalogBackupFromJson,
  loadCatalogProjects,
  type ProjectBackupExport,
} from '../model/catalogOperations';

/**
 * Estado y acciones expuestas por el hook `useCatalog`.
 */
export interface UseCatalogResult {
  projects: ProjectSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createProject: (title: string, artist: string) => Promise<ProjectFullData | null>;
  duplicateProject: (projectId: string) => Promise<ProjectFullData | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  exportProjectBackup: (projectId: string) => Promise<ProjectBackupExport | null>;
  importBackup: (jsonString: string) => Promise<boolean>;
  clearError: () => void;
}

function toSpanishErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return fallback;
}

/**
 * Gestiona el catálogo local de transcripciones sobre un `IStorageAdapter`.
 */
export function useCatalog(
  adapter: IStorageAdapter = storageService,
): UseCatalogResult {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadCatalogProjects(adapter);
      setProjects(list);
    } catch (err) {
      setError(
        toSpanishErrorMessage(
          err,
          'No se pudieron cargar las transcripciones guardadas.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial(): Promise<void> {
      try {
        const list = await loadCatalogProjects(adapter);
        if (!cancelled) {
          setProjects(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            toSpanishErrorMessage(
              err,
              'No se pudieron cargar las transcripciones guardadas.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitial();

    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const createProject = useCallback(
    async (title: string, artist: string): Promise<ProjectFullData | null> => {
      setError(null);
      try {
        const created = await createCatalogProject(adapter, title, artist);
        const list = await loadCatalogProjects(adapter);
        setProjects(list);
        return created;
      } catch (err) {
        setError(
          toSpanishErrorMessage(err, 'No se pudo crear la nueva transcripción.'),
        );
        return null;
      }
    },
    [adapter],
  );

  const duplicateProject = useCallback(
    async (projectId: string): Promise<ProjectFullData | null> => {
      setError(null);
      try {
        const duplicated = await duplicateCatalogProject(adapter, projectId);
        const list = await loadCatalogProjects(adapter);
        setProjects(list);
        return duplicated;
      } catch (err) {
        setError(
          toSpanishErrorMessage(err, 'No se pudo duplicar la transcripción.'),
        );
        return null;
      }
    },
    [adapter],
  );

  const deleteProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      setError(null);
      try {
        await deleteCatalogProject(adapter, projectId);
        const list = await loadCatalogProjects(adapter);
        setProjects(list);
        return true;
      } catch (err) {
        setError(
          toSpanishErrorMessage(err, 'No se pudo eliminar la transcripción.'),
        );
        return false;
      }
    },
    [adapter],
  );

  const exportProjectBackup = useCallback(
    async (projectId: string): Promise<ProjectBackupExport | null> => {
      setError(null);
      try {
        return await exportCatalogProjectBackup(adapter, projectId);
      } catch (err) {
        setError(
          toSpanishErrorMessage(
            err,
            'No se pudo exportar el respaldo de la transcripción.',
          ),
        );
        return null;
      }
    },
    [adapter],
  );

  const importBackup = useCallback(
    async (jsonString: string): Promise<boolean> => {
      setError(null);
      try {
        await importCatalogBackupFromJson(adapter, jsonString);
        const list = await loadCatalogProjects(adapter);
        setProjects(list);
        return true;
      } catch (err) {
        setError(
          toSpanishErrorMessage(
            err,
            'No se pudo importar el respaldo seleccionado.',
          ),
        );
        return false;
      }
    },
    [adapter],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    projects,
    loading,
    error,
    refresh,
    createProject,
    duplicateProject,
    deleteProject,
    exportProjectBackup,
    importBackup,
    clearError,
  };
}
