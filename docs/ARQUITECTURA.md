# Arquitectura — LRC Studio

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
  features/                       # sync, lyrics, catalog, export, session
    <tema>/
      components/
      hooks/
      model/                      # Lógica pura sin React (temporización, Pre-Roll, foco automático de palabra, progreso, exportadores LRC/ELRC/JSON); se prueba con Vitest
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
export type ActiveTab = 'sync' | 'word' | 'lyrics' | 'export' | 'catalog';
// Una sesión guardada con el valor legado 'loupe' (la Lupa, eliminada) se restaura como 'sync':
// `sessionPlanner` y `WebIndexedDBAdapter` lo normalizan. No cambia la forma de los datos: sin migrador.

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

### Formatos de importación JSON y migración de esquemas

El botón **Importar** del catálogo acepta dos formatos JSON distintos:
- **Respaldo de catálogo (`CatalogBackup`, `schemaVersion: 1`):** incluye arreglos `projects` y `audios` con binarios en base64; se restaura completo en el adaptador.
- **Proyecto JSON individual (`exportJson`, esquema actual `lrc-studio.1`):** incluye arreglo `lines` sin `projects`; se normaliza mediante el migrador paso a paso `migrateProjectJson` (`src/features/export/model/projectMigrations.ts`, que acepta versiones legadas `sin schemaVersion`, `1`/`1.0`, `2.0` y `2.0-musixmatch-richsync`, además de `lrc-studio.1`, y rechaza versiones futuras como `lrc-studio.N` o desconocidas) y crea un proyecto nuevo con `id` único y sin binario de audio.

#### Cadenas de migración (todo dato persistido o exportado tiene versión de esquema)

Las tres cadenas usan la utilidad pura `runMigrations` (`src/lib/schemaMigration.ts`): aplica los pasos uno a uno hasta la versión actual y devuelve error claro (nunca continúa en silencio) si falta un paso, la versión es desconocida o futura («Esta versión de LRC Studio no reconoce el esquema X, actualiza la app.») o hay un ciclo.

| Cadena | Dónde vive | Versión actual | Versiones conocidas |
| :--- | :--- | :--- | :--- |
| Proyecto JSON exportado | `src/features/export/model/projectMigrations.ts` (`PROJECT_MIGRATION_STEPS`) | `lrc-studio.1` | `1.0`, `2.0`, `2.0-musixmatch-richsync`, `lrc-studio.1` |
| Respaldo del catálogo | `src/storage/backupMigrations.ts` (`BACKUP_MIGRATION_STEPS`, `BACKUP_SCHEMA_VERSION` en `src/types`) | `1` | `1` (sin pasos todavía; listo para `1 -> 2`) |
| Proyecto almacenado en IndexedDB | `src/storage/storedProjectMigrations.ts` (`STORED_PROJECT_MIGRATION_STEPS`, `STORED_PROJECT_SCHEMA_VERSION` en `src/types`) | `2` | `1` (registros sin versión), `2`. Paso `1 -> 2`: elimina `settings.sniperMode` |

**Contrato de lectura (comprobar siempre):** en cada lectura de datos persistidos o importados (cargar proyecto, restaurar sesión, listar catálogo, exportar/importar respaldo, importar proyecto JSON) se comprueba la versión de esquema; si no es la actual se migra paso a paso en memoria y después se **valida la forma** del resultado (no solo la versión). Se escribe siempre con la versión actual.

**Nunca borrar ni fallar en silencio:**
- Si el registro está mal formado, la migración falla o la versión es futura o desconocida, el registro original se conserva **tal cual (crudo)** en IndexedDB: `getProject` lanza `UnrestorableProjectError` con el motivo, `saveProject` (autoguardado) y la importación de respaldos **rechazan** pisar un registro no restaurable, y nada se escribe parcialmente.
- La UI siempre informa: el catálogo muestra el registro como «No se puede restaurar» (sin opción de abrir) con el motivo y el botón **Descargar original** (JSON crudo, tal como está guardado) para revisarlo o corregirlo a mano; eliminarlo es solo una acción explícita de la usuaria con confirmación, nunca automática (`IStorageAdapter.listUnrestorableProjects` y `getRawProjectJson`).
- Restaurar sesión: si el proyecto activo no se puede restaurar, la app arranca igual en estado vacío mostrando el aviso (`RestoreNoticeBanner`), sin borrar ni sobrescribir el registro.
- Importar un archivo inválido (JSON de proyecto o respaldo) muestra el motivo y no escribe nada. Exportar un respaldo completo falla con mensaje claro si hay registros no restaurables (la usuaria descarga primero su original).

**Procedimiento para agregar una versión de esquema:**
1. Subir la constante de versión actual (`PROJECT_JSON_SCHEMA_VERSION`, `BACKUP_SCHEMA_VERSION` o `STORED_PROJECT_SCHEMA_VERSION`) y agregar la nueva versión al final de la lista de versiones conocidas.
2. Agregar al final del mapa de pasos el paso desde la versión anterior (`{ nextVersion, migrate }`); `migrate` no muta el documento recibido.
3. Agregar un fixture de la versión anterior (`__fixtures__/`) y cubrirlo en la prueba de garantía de la cadena (cada versión conocida excepto la actual tiene paso; cada fixture migra hasta la actual y produce datos válidos).
4. Nunca borrar ni reescribir pasos ni fixtures existentes.

### Selector de adaptador (`src/storage/index.ts`)

- Detecta `typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window`.
- Si existe, instancia `TauriRustSqliteAdapter`; en caso contrario, `WebIndexedDBAdapter`.
- Exporta `storageService` como instancia única.

### `WebIndexedDBAdapter`

- Usa **IndexedDB nativo** con tres *object stores*:
  - `projects`: metadatos y letras (`ProjectFullData`, sin binario).
  - `audio`: binarios de audio (`Blob` / `ArrayBuffer`), `fileName`, `peaks`, `durationMs`.
  - Formatos de audio soportados (fuente única en `src/lib/audioFormats.ts`): MP3, WAV, FLAC (`audio/flac`), OGG, OGA, M4A, AAC, OPUS y WEBM. El selector de audio omite el filtro `accept` en todas las plataformas (`getAudioInputAccept` devuelve `""`) para que proveedores en la nube (Drive, iCloud, etc.) no atenúen archivos `.flac` por MIME/UTI desconocido; la validación programática recae en `isSupportedAudioFile`.
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

- **Debounce:** `300 ms` ante cualquier cambio de letra, marca de línea, captura de palabra o ajuste de milisegundos (únicos cambios que muestran `Guardando` → `Guardado`).
- **Guardado silencioso de sesión:** cambios exclusivos de `SessionState` (pestaña/modo activo, línea/palabra activa y `currentTime`) se persisten solo vía `saveSessionState` con debounce más largo (`800 ms`, deduplicados y sin alterar el indicador ni escribir el proyecto).
- **Store externo de tiempo:** `PlaybackTimeStore` (`useSyncExternalStore` con throttle en componentes hoja) desacopla `currentTime` del contexto principal para que la reproducción a 60 FPS no re-renderice el árbol de la aplicación.
- **Reloj único al marcar y compensación de latencia:** toda acción de marcado (táctil o teclado) lee `player.getCurrentTimeMs()` (`audio.currentTime` directo) en el instante del evento y resta `latencyMs` (0–500 ms, persistido por dispositivo en `meta`/`IStorageAdapter`) mediante `computeCompensatedStampMs`.
- **Guardado inmediato (flush):** en eventos `visibilitychange` (al ocultarse la pestaña), `pagehide` y `beforeunload`.
- **Actualización de versión:** antes de recargar por una nueva versión disponible, se debe ejecutar `flush()` del autoguardado.
- **Restauración al abrir:** recupera `SessionState`, carga la canción activa (`getProject` + `getAudioBinary`), reconstruye el `ObjectURL` desde el binario, restaura `waveformPeaks` y posiciona exactamente en `currentTimeMs`, `activeLineIndex` y `activeWordIndex`.
- **Audio de reproducción (salto exacto en MP3/AAC):** el seek de un `<audio>` sobre MP3 (sobre todo VBR) y AAC ADTS se estima por bytes y se desfasa cientos de ms. Por eso, solo para `audio/mpeg` y `audio/aac` (`needsPcmPlaybackProxy`, `src/lib/audioFormats.ts`), el mismo `<audio>` reproduce un WAV PCM 16 bits generado en memoria (`src/lib/wavEncoder.ts`, `decodePlaybackBlob` y `importAudioFile` en `src/lib/audioImport.ts`). WAV, FLAC, M4A, OGG, OPUS y WEBM se reproducen del original. Se decodifica a 44,1 kHz fijos con un `OfflineAudioContext`; si el PCM estéreo superaría 64 MB (≈ 6 min) se mezcla a mono; la conversión Float32 a Int16 es por bloques cediendo el hilo (≈ 8 ms) y mientras tanto se muestra «Preparando audio…» y Reproducir queda con `aria-busy`. El WAV es solo de reproducción: **nunca se persiste ni se exporta**; `AudioBinaryRecord`, el respaldo y la exportación siguen usando el blob original (sin cambio de esquema). Se crea al importar, al abrir desde el catálogo y al restaurar la sesión (`createPlaybackObjectUrl`, `src/features/session`); un solo WAV queda en caché en memoria por proyecto activo y la reparación de audio lo reutiliza sin decodificar de nuevo. Si la decodificación falla se reproduce el original y se muestra un aviso no bloqueante (nunca un fallo silencioso). Riesgo conocido: el decodificador puede recortar el retardo del codificador MP3 (~25 ms) de forma distinta al elemento `<audio>`; las marcas se toman sobre el WAV, de modo que marcar y reproducir son coherentes.

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

- **Sensación nativa (sin selección ni zoom):**
  - Sin selección de texto en toda la app (`user-select: none`, `-webkit-user-select`, `-webkit-touch-callout: none`), salvo `input`, `textarea`, `[contenteditable]` y elementos con la utilidad `selectable`, donde la usuaria escribe o copia texto.
  - Sin zoom de página: meta viewport con `maximum-scale=1, user-scalable=no`; `touch-action: manipulation` global (los componentes con arrastre propio mantienen `touch-action: none`); campos a 16 px en móvil para evitar el zoom automático de iOS.
  - `src/lib/nativeFeel.ts` (montado una vez en `App`, con limpieza) previene `gesture*` y el pinch de varios dedos (iOS Safari), Ctrl/Cmd + rueda, Ctrl/Cmd + `+`, `-`, `=` y la selección por doble clic fuera de campos editables. Ctrl/Cmd + `0` no se previene a propósito: restablece el zoom del navegador al 100 %. No intercepta teclas sin Ctrl/Cmd, por lo que no choca con los atajos de sincronización.
- **Página fija (T35):** la página nunca se deforma ni se mueve mientras se toca sin parar.
  - `overscroll-behavior: none` en `html`/`body` (sin rebote ni pull-to-refresh) y `overscroll-behavior: contain` en todo contenedor con scroll interno, para no encadenar el scroll a la página.
  - Sin scroll horizontal de la página en 390x844 ni 1280x800 (cubierto por E2E); se corrige el elemento que desborda, el `overflow-x-hidden` global es solo red de seguridad.
  - Altura estable en móvil con `dvh` (no `vh`); `viewport-fit=cover` y `env(safe-area-inset-*)` en el layout móvil. Al salir de un campo editable, `nativeFeel` restablece el scroll de la página si el teclado virtual la dejó desplazada.
  - `contextmenu` prevenido fuera de campos editables (`shouldPreventContextMenu`), `-webkit-touch-callout: none`, sin arrastre nativo de imágenes ni enlaces (`shouldPreventDragStart`, salvo zonas con `data-allow-drag`; el drop de archivos no se afecta) y sin resaltado al tocar (`-webkit-tap-highlight-color: transparent`), conservando `:focus-visible` para teclado.
  - Sin saltos de layout: cifras con `font-variant-numeric: tabular-nums` (`.font-mono`), botones que cambian de icono (Reproducir/Pausar) con tamaño fijo, y avisos en vivo fuera del flujo.
  - El centrado de la línea activa usa `scrollTop` del contenedor (`useCenteredListScroll`), nunca `scrollIntoView`, y salta sin animación con `prefers-reduced-motion`.

- **Móvil / táctil:** el botón gigante de sincronización usa `onPointerDown` (latencia cero) para marcar; no hay modos que dependan de soltar el botón.
- **Escritorio (teclado):**
  - `Espacio`: marcar línea o palabra.
  - `R`: repetir Pre-Roll (`-2.5 s`).
  - `P`: reproducir / pausar.
  - `Flecha izquierda / derecha`: ajustar `±50 ms`.
  - `[` / `]`: ajustar `±10 ms` *(supuesto: se asignan los corchetes para el ajuste fino de 10 ms)*.
  - `Z`, `Ctrl+Z` o `Retroceso`: deshacer (en modo Palabra, la última palabra marcada).

## 8. Lógica de sincronización a conservar

Tomada de [docs/base/lyricsync_studio_pro_2_00.tsx](base/lyricsync_studio_pro_2_00.tsx):
- Modo **Línea**.
- Modo **Palabra por palabra** con **Pre-Roll** y foco automático: cada marca avanza sola a la próxima palabra sin marca (cruzando líneas) y el deshacer quita la última palabra marcada, deja el foco en ella y vuelve el audio a `inicio − Pre-Roll`.
- El selector tiene Línea, Palabra y Karaoke (el antiguo modo Ráfaga y la Lupa de onda ya no existen).
- **Inspector** de escritorio de `10 ms` y `50 ms` (`src/features/sync/`), más los atajos `←`/`→` y `[`/`]`.
- **Reproducir desde aquí** (y repetir Pre-Roll y deshacer palabra) usan `playFrom`: salta siempre al milisegundo de la marca y suena al instante, es idempotente y nunca pausa aunque se toque muchas veces seguidas. El vigilante de progreso ignora los seeks (generación de seek) y exige dos veredictos de congelado consecutivos antes de reparar.
- **Transporte móvil** (`TransportBar`): velocidad, −5 s, reproducir/pausa y +5 s en Línea y en Palabra. La velocidad siempre arranca en `1.0x` al abrir o restaurar un proyecto y cambiarla no guarda el proyecto; se resalta cuando no es `1x`.
- **Karaoke a 60 FPS**.
- Exportación a **JSON**, **ELRC** y **LRC**.
