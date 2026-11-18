# Backlog del Sprint — LyricSync Studio

Modelos sugeridos según `AGENTS.md` §4:
- **low:** `gemini-4-hydrogen-low` (scaffolding, maquetado, tipos, docs).
- **medium:** `gemini-4-hydrogen-medium` (lógica de negocio, transacciones, refactor).
- **high:** `gemini-4-hydrogen-high` (QA, tests, casos borde).

| ID | Tarea | Depende de | Modelo | Paralelo | Criterio de aceptación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `T1` (hecho) | Scaffolding Vite + React + TS + Tailwind con `pnpm` (`packageManager: "pnpm@12.21.0"`), `.npmrc` (`save-exact=true`), `pnpm-lock.yaml`, scripts (`typecheck`, `lint`, `test`, `build`, `test:e2e`) y dependencias exactas de `docs/DEPENDENCIAS.md` | — | `low` | No | `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` pasan en vacío y se instalan exactamente las dependencias de `docs/DEPENDENCIAS.md`. |
| `T2` (hecho) | Tipos compartidos (`src/types/`) y contrato `IStorageAdapter` | `T1` | `low` | No | Tipos compilados en TS estricto sin `any` y contrato `IStorageAdapter` completo. |
| `T3` (hecho) | `WebIndexedDBAdapter` + stub `TauriRustSqliteAdapter` + selector + pruebas con `fake-indexeddb` | `T2` | `medium` | No | Pruebas unitarias con `fake-indexeddb` en verde para proyectos, blobs, sesión y respaldo JSON. |
| `T4` hecho | Librería `src/ui/` y tokens Tailwind («Estudio táctil») | `T1` | `low` | Sí (con `T2`/`T3` si no toca `src/types/`) | Los 10 componentes de `src/ui/` renderizan con tokens exactos de `neo.css` y fuentes autoalojadas. |
| `T5` (hecho) | Migración de la lógica de sincronización desde `docs/base/lyricsync_studio_pro_2_00.tsx` a `src/features/sync/` y `src/features/export/` sin llamadas directas a storage | `T2`, `T3` | `medium` | No | Modo línea, palabra (Pre-Roll y Francotirador), ráfaga, 60 FPS y exportadores LRC/ELRC/JSON cubiertos por Vitest. |
| `T6` (hecho) | Autoguardado (`debounce` 300 ms, `visibilitychange`, `pagehide`, `flush`) y restauración de sesión | `T3`, `T5` | `medium` | No | Al recargar se restaura canción, `ObjectURL`, `waveformPeaks` y posición exacta de línea y palabra. |
| `T7` hecho | Catálogo «Mis Transcripciones» (`src/features/catalog/`) | `T3`, `T4` | `medium` | Sí (con `T6` si no comparten archivos) | Lista tarjetas con progreso y ejecuta Abrir, Nueva, Duplicar, Exportar `.json` y Eliminar. |
| `T8` (hecho) | Pantallas móviles (Sincronizar linea, Palabra con Pre-Roll y botón gigante `onPointerDown`/`onPointerUp`) | `T4`, `T5`, `T6` | `medium` | No | Flujo móvil completo en `390x844` con objetivos táctiles ≥ 48 px y palabra objetivo a 72 px. |
| `T9` (hecho) | Lupa de onda con bordes arrastrables e inspector `10 ms` / `50 ms` (`src/features/loupe/`) | `T4`, `T5` | `medium` | Sí (con `T8` si no tocan `src/ui/`) | Bordes arrastrables ajustan `startMs`/`endMs` y botones de inspector ajustan `±10 ms` y `±50 ms`. |
| `T10` (hecho) | Vista de escritorio (`1280x800`) y atajos de teclado (`Espacio`, `R`, `P`, flechas, `[` / `]`) | `T4`, `T5`, `T9` | `medium` | No | Diseño multipanel funcional en escritorio con todos los atajos operativos y `Keycap` visibles. |
| `T10b` (hecho) | Completar el escritorio con la vista Karaoke a 60 FPS (`KaraokePreview`) y normalizar finales de línea LF en `.gitattributes` | `T10` | `low` | No | Selector Karaoke en barra superior de escritorio mostrando `KaraokePreview` en el centro, sin scroll horizontal (`768`–`1920` px), y `.gitattributes` con LF para scripts/Dockerfile/nginx/YAML. |
| `T11` (hecho) | Pantallas Letra y Exportar siguiendo «Estudio táctil» | `T4`, `T5` | `low` | Sí (con `T10` si no tocan `src/ui/`) | Edición de letra y exportación LRC/ELRC/JSON operativas en móvil y escritorio. |
| `T12` (hecho) | Versionado (`version.json`, `APP_VERSION`, `APP_COMMIT`, aviso con `flush`) y SEO (`index.html`, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`) | `T1`, `T6` | `low` | Sí (con `T11` salvo `index.html`) | Aviso de nueva versión hace `flush` antes de recargar y SEO cumple `docs/RELEASE.md`. |
| `T13` (hecho) | `Dockerfile` multi-stage, `nginx.conf` (caché + CSP) y workflow GHCR | `T12` (hecho) | `low` | No | `docker build` y `docker run` sirven la app en `8080` con cabeceras de caché y seguridad verificadas por `curl`. |
| `T14` (hecho) | Suite E2E Playwright (`390x844` y `1280x800`, sesión, autoguardado, catálogo, `pointerdown`, teclado, SEO) | `T7`–`T13` | `high` | No (puerto fijo) | `pnpm test:e2e` pasa al 100% en ambos viewports. |
| `T15` | Preparar release `v0.1.0` (`release/v0.1.0`, build, Docker local, notas, PR a `main`) | `T14` | `high` | No | PR a `main` en verde y listo para presentar en la puerta G1. |
| `T16` (hecho) | Imagen multi-arquitectura (`linux/amd64` y `linux/arm64`) en GHCR, `docker-compose.yml` de producción fijado al tag exacto, `scripts/bump-compose-tag.sh` y stack local `docker-compose.dev.yml` + `scripts/dev-stack.sh` para pruebas en LAN | `T13` | `medium` | No | `docker buildx build --platform linux/arm64`, `docker compose config`, `bump-compose-tag.test.sh`, `verify-docker.sh` y `dev-stack.sh` en verde con acceso por LAN. |
| `T17` (hecho) | Puerto local 30601 | `T16` | `low` | No | `docker compose -f docker-compose.dev.yml config` muestra `published: "30601"` y `target: 8080`, y `bash scripts/dev-stack.sh status` no falla. |
