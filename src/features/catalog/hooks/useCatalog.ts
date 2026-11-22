import { useCallback, useEffect, useState } from 'react';
import { storageService, type IStorageAdapter } from '@/storage';
import type { ProjectFullData, ProjectSummary, UnrestorableProject } from '@/types';
import {
  createCatalogProject,
  deleteCatalogProject,
  duplicateCatalogProject,
  exportCatalogProjectBackup,
  exportRawProject,
  importCatalogBackupFromJson,
  loadCatalog,
  type ProjectBackupExport,
} from '../model/catalogOperations';

/**
 * Estado y acciones expuestas por el hook `useCatalog`.
 */
export interface UseCatalogResult {
  projects: ProjectSummary[];
  /** Registros guardados que no se pueden restaurar; se conservan intactos. */
  unrestorable: UnrestorableProject[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createProject: (title: string, artist: string) => Promise<ProjectFullData | null>;
  duplicateProject: (projectId: string) => Promise<ProjectFullData | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  exportProjectBackup: (projectId: string) => Promise<ProjectBackupExport | null>;
  /** Prepara la descarga del JSON original, tal como está guardado, de un registro no restaurable. */
  exportRawProject: (projectId: string) => Promise<ProjectBackupExport | null>;
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
  const [unrestorable, setUnrestorable] = useState<UnrestorableProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const loaded = await loadCatalog(adapter);
    setProjects(loaded.projects);
    setUnrestorable(loaded.unrestorable);
  }, [adapter]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await reload();
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
  }, [reload]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial(): Promise<void> {
      try {
        const loaded = await loadCatalog(adapter);
        if (!cancelled) {
          setProjects(loaded.projects);
          setUnrestorable(loaded.unrestorable);
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
        await reload();
        return created;
      } catch (err) {
        setError(
          toSpanishErrorMessage(err, 'No se pudo crear la nueva transcripción.'),
        );
        return null;
      }
    },
    [adapter, reload],
  );

  const duplicateProject = useCallback(
    async (projectId: string): Promise<ProjectFullData | null> => {
      setError(null);
      try {
        const duplicated = await duplicateCatalogProject(adapter, projectId);
        await reload();
        return duplicated;
      } catch (err) {
        setError(
          toSpanishErrorMessage(err, 'No se pudo duplicar la transcripción.'),
        );
        return null;
      }
    },
    [adapter, reload],
  );

  const deleteProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      setError(null);
      try {
        await deleteCatalogProject(adapter, projectId);
        await reload();
        return true;
      } catch (err) {
        setError(
          toSpanishErrorMessage(err, 'No se pudo eliminar la transcripción.'),
        );
        return false;
      }
    },
    [adapter, reload],
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

  const exportRaw = useCallback(
    async (projectId: string): Promise<ProjectBackupExport | null> => {
      setError(null);
      try {
        const title = unrestorable.find((item) => item.id === projectId)?.title;
        return await exportRawProject(adapter, projectId, title);
      } catch (err) {
        setError(
          toSpanishErrorMessage(
            err,
            'No se pudo descargar el original de la transcripción.',
          ),
        );
        return null;
      }
    },
    [adapter, unrestorable],
  );

  const importBackup = useCallback(
    async (jsonString: string): Promise<boolean> => {
      setError(null);
      try {
        await importCatalogBackupFromJson(adapter, jsonString);
        await reload();
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
    [adapter, reload],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    projects,
    unrestorable,
    loading,
    error,
    refresh,
    createProject,
    duplicateProject,
    deleteProject,
    exportProjectBackup,
    exportRawProject: exportRaw,
    importBackup,
    clearError,
  };
}
