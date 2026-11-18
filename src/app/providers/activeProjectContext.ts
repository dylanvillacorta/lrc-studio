import { createContext, useContext } from 'react';
import type {
  AutosaveState,
  SaveStatus,
  SessionRestoreStatus,
} from '@/features/session';
import type {
  UseAudioPlayerReturn,
  UseSyncEngineReturn,
} from '@/features/sync';
import type { AudioFileInput } from '@/lib/audioImport';
import type { ActiveTab, ProjectFullData } from '@/types';

let activeFlushHandler: (() => Promise<void>) | null = null;

/**
 * Registra el manejador de flush del `ActiveProjectProvider` montado.
 */
export function registerActiveFlushHandler(
  handler: () => Promise<void>,
): () => void {
  activeFlushHandler = handler;
  return () => {
    if (activeFlushHandler === handler) {
      activeFlushHandler = null;
    }
  };
}

/**
 * Vacía cualquier autoguardado pendiente del proyecto activo antes de recargar la app (p. ej. T12).
 */
export async function flushPendingSave(): Promise<void> {
  if (activeFlushHandler) {
    await activeFlushHandler();
  }
}

export interface CreateProjectInput {
  title?: string;
  artist?: string;
}

export interface ActiveProjectContextValue {
  project: ProjectFullData | null;
  restoreStatus: SessionRestoreStatus;
  restoreError: string | null;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  audioUrl: string | null;
  waveformPeaks: number[];
  /** Duración del audio activo en segundos (`0` si no hay audio cargado). */
  audioDuration: number;
  saveStatus: SaveStatus;
  autosaveState: AutosaveState;
  sync: UseSyncEngineReturn;
  player: UseAudioPlayerReturn;
  openProject: (projectId: string) => Promise<void>;
  createProject: (input?: CreateProjectInput) => Promise<ProjectFullData>;
  attachAudio: (file: AudioFileInput) => Promise<void>;
  updateProjectMetadata: (
    patch: Partial<Pick<ProjectFullData, 'title' | 'artist' | 'settings'>>,
  ) => void;
  clearActiveProject: () => Promise<void>;
  flushPendingSave: () => Promise<void>;
}

export const ActiveProjectContext =
  createContext<ActiveProjectContextValue | null>(null);

/**
 * Devuelve el contexto del proyecto activo, motor de sincronización, reproductor y autoguardado.
 */
export function useActiveProject(): ActiveProjectContextValue {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) {
    throw new Error(
      'useActiveProject debe usarse dentro de un ActiveProjectProvider.',
    );
  }
  return ctx;
}
