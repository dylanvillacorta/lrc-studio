# Arquitectura — LyricSync Studio

## 1. Stack tecnológico

- **Frontend:** Vite + React + TypeScript estricto (`strict: true`).
- **Estilos:** Tailwind CSS (sistema visual «Estudio táctil», *mobile-first*).
- **Escritorio futuro:** preparado para **Tauri v2** mediante capa de almacenamiento desacoplada.
- **Pruebas:** Vitest (`fake-indexeddb` para almacenamiento, lógica de sincronización y exportadores) + Playwright (E2E móvil `390x844` y escritorio `1280x800`).

## 2. Estructura de carpetas

Toda la aplicación corre en el navegador (sin backend), organizada por responsabilidad para mantenibilidad. Se compila como una sola SPA (un bundle servido por nginx), sin carga perezosa salvo decisión posterior.

```text
e2e/                              # Pruebas E2E con Playwright
src/
  app/
    main.tsx
    App.tsx
    layouts/                      # Layouts de móvil y escritorio
    providers/                    # Providers de storage y sesión (solo componen, sin lógica de negocio)
  features/                       # sync, lyrics, catalog, loupe, export, session
    <tema>/
      components/
      hooks/
      model/                      # Lógica pura sin React (temporización, Pre-Roll, Francotirador, progreso, exportadores LRC/ELRC/JSON); se prueba con Vitest
      index.ts                    # API pública de la feature
  storage/
    IStorageAdapter.ts
    WebIndexedDBAdapter.ts
    TauriRustSqliteAdapter.ts     # Stub documentado para Tauri v2
    index.ts                      # Selector por window.__TAURI_INTERNALS__
  ui/                             # Librería neumórfica reutilizable, sin conocimiento de negocio
  lib/                            # Utilidades puras (formato de tiempo, picos de onda, ids, fechas)
  types/                          # Tipos compartidos
  styles/                         # Tokens y estilos globales de Tailwind
```

**Reglas obligatorias de organización:**
- **Dirección de dependencias:** `app` → `features` → (`ui`, `storage`, `lib`, `types`), nunca al revés.
- **Encapsulación de features:** una feature no importa archivos internos de otra, solo su `index.ts`.
- **Persistencia:** ningún componente toca `localStorage` ni `IndexedDB`; todo acceso pasa por `storage` vía provider.
- **Pruebas unitarias:** junto al código (`archivo.test.ts`); pruebas E2E en `e2e/` en la raíz.
- **Alias de importación:** `@/` para `src/`.
- **Tamaño y granularidad:** límite orientativo de 300 líneas por archivo y 200 por componente (el `.tsx` base de 2835 líneas debe dividirse, no copiarse); un componente por archivo.
- **Idioma:** nombres en inglés para código y en español para textos de interfaz.

## 3. Contratos y tipos (`src/types/`)

```typescript
export type ActiveTab = 'sync' | 'word' | 'lyrics' | 'loupe' | 'export' | 'catalog';

export interface WordTiming {
  id: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
}

export interface LyricLine {
  id: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
  words: WordTiming[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  artist: string;
  audioFileName: string;
  durationMs: number;
  lineProgressPct: number;
  wordProgressPct: number;
  updatedAt: number;
}

export interface ProjectFullData extends ProjectSummary {
  lines: LyricLine[];
  waveformPeaks: number[];
  createdAt: number;
}

export interface AudioBinaryRecord {
  projectId: string;
  blob: Blob | ArrayBuffer;
  fileName: string;
  peaks: number[];
  durationMs: number;
}

export interface SessionState {
  activeProjectId: string | null;
  activeTab: ActiveTab;
  currentTimeMs: number;
  activeLineIndex: number;
  activeWordIndex: number;
}
```

## 4. Contrato `IStorageAdapter` (`src/storage/IStorageAdapter.ts`)

Todos los métodos son asíncronos (`Promise`).

```typescript
export interface IStorageAdapter {
  init(): Promise<void>;
  listProjects(): Promise<ProjectSummary[]>; // Ligero, sin blobs de audio
  getProject(projectId: string): Promise<ProjectFullData | null>;
  saveProject(project: ProjectFullData): Promise<void>;
  saveAudioBinary(
    projectId: string,
    binary: Blob | ArrayBuffer,
    fileName: string,
    peaks: number[],
    durationMs: number,
  ): Promise<void>;
  getAudioBinary(projectId: string): Promise<AudioBinaryRecord | null>;
  deleteProject(projectId: string): Promise<void>;
  getSessionState(): Promise<SessionState | null>;
  saveSessionState(state: SessionState): Promise<void>;
  exportFullCatalogBackup(): Promise<string>; // JSON serializado
  importCatalogBackup(json: string): Promise<void>;
}
```

### Selector de adaptador (`src/storage/index.ts`)

- Detecta `typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window`.
- Si existe, instancia `TauriRustSqliteAdapter`; en caso contrario, `WebIndexedDBAdapter`.
- Exporta `storageService` como instancia única.

### `WebIndexedDBAdapter`

- Usa **IndexedDB nativo** con tres *object stores*:
  - `projects`: metadatos y letras (`ProjectFullData`, sin binario).
  - `audio`: binarios de audio (`Blob` / `ArrayBuffer`), `fileName`, `peaks`, `durationMs`.
  - Formatos de audio soportados (fuente única en `src/lib/audioFormats.ts`): MP3, WAV, FLAC (`audio/flac`), OGG, OGA, M4A, AAC, OPUS y WEBM.
  - `meta`: estado de sesión y metadatos globales.
- `localStorage` se reserva únicamente para punteros ligeros de sesión si fuera necesario para lectura síncrona inicial.
- **Privacidad:** ningún dato ni audio se envía a servidores externos.

### `TauriRustSqliteAdapter` (stub)

- Implementa `IStorageAdapter` delegando en `invoke(...)` de Tauri v2 (pendiente de implementar en el backend Rust):
  - `init_sqlite`
  - `list_projects_sqlite`
  - `get_project_sqlite`
  - `save_project_sqlite`
  - `save_audio_to_disk`
  - `get_audio_from_disk`
  - `delete_project_sqlite`
  - `get_session_state_sqlite`
  - `save_session_state_sqlite`
  - `export_catalog_backup_sqlite`
  - `import_catalog_backup_sqlite`

## 5. Autoguardado y restauración de sesión

- **Debounce:** `300 ms` ante cualquier cambio de letra, marca de línea, captura de palabra o ajuste de milisegundos.
- **Guardado inmediato (flush):** en eventos `visibilitychange` (al ocultarse la pestaña) y `pagehide`.
- **Actualización de versión:** antes de recargar por una nueva versión disponible, se debe ejecutar `flush()` del autoguardado.
- **Restauración al abrir:** recupera `SessionState`, carga la canción activa (`getProject` + `getAudioBinary`), reconstruye el `ObjectURL` desde el binario, restaura `waveformPeaks` y posiciona exactamente en `currentTimeMs`, `activeLineIndex` y `activeWordIndex`.

## 6. Catálogo «Mis Transcripciones»

Cada tarjeta muestra:
- Título y artista.
- Nombre del archivo de audio.
- Progreso de líneas (`%`) y progreso de palabras (`%`).
- Fecha/hora de última edición.

Acciones disponibles:
- **Abrir / Continuar**
- **Nueva transcripción**
- **Duplicar**
- **Exportar respaldo `.json`**
- **Eliminar**

## 7. Entrada táctil y atajos de teclado

- **Móvil / táctil:** el botón gigante de sincronización usa `onPointerDown` (latencia cero) para marcar y `onPointerUp` para el modo mantener.
- **Escritorio (teclado):**
  - `Espacio`: marcar línea o palabra.
  - `R`: repetir Pre-Roll (`-2.5 s`).
  - `P`: reproducir / pausar.
  - `Flecha izquierda / derecha`: ajustar `±50 ms`.
  - `[` / `]`: ajustar `±10 ms` *(supuesto: se asignan los corchetes para el ajuste fino de 10 ms)*.

## 8. Lógica de sincronización a conservar

Tomada de [docs/base/lyricsync_studio_pro_2_00.tsx](base/lyricsync_studio_pro_2_00.tsx):
- Modo **Línea**.
- Modo **Palabra por palabra** con **Pre-Roll** y **Francotirador**.
- **Ráfaga** de línea aislada.
- **Lupa de onda** con bordes arrastrables e inspector de `10 ms` y `50 ms`.
- **Karaoke a 60 FPS**.
- Exportación a **JSON**, **ELRC** y **LRC**.
