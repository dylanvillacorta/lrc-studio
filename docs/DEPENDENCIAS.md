# Dependencias aprobadas — LyricSync Studio

Lista aprobada por el usuario (puerta G3) el **2026-11-18**. Cualquier dependencia nueva o actualización de versión mayor requiere aprobación explícita (G3).

- **Gestor de paquetes:** `pnpm` `12.21.0` (`packageManager: "pnpm@12.21.0"`, activado con `corepack`).
- **Node:** mínimo `22.12` (Node `24` en Docker y CI).
- **Versiones exactas:** `.npmrc` con `save-exact=true` (sin caret `^`) y `pnpm-lock.yaml` versionado.

## Producción (`dependencies`)

| Paquete | Versión | Uso |
| :--- | :--- | :--- |
| `react` | `19.3.1` | Librería de UI |
| `react-dom` | `19.3.1` | Renderizado en navegador |
| `@fontsource-variable/manrope` | `5.3.0` | Tipografía principal autoalojada |
| `@fontsource/jetbrains-mono` | `5.3.0` | Tipografía monoespaciada autoalojada |

## Desarrollo (`devDependencies`)

| Paquete | Versión | Uso |
| :--- | :--- | :--- |
| `vite` | `8.3.8` | Bundler y servidor de desarrollo |
| `@vitejs/plugin-react` | `6.3.0` | Integración React en Vite |
| `tailwindcss` | `4.3.5` | Sistema de estilos |
| `@tailwindcss/vite` | `4.3.5` | Plugin de Tailwind para Vite |
| `typescript` | `6.0.3` | Compilador TypeScript |
| `@types/react` | `19.3.0` | Tipos de React |
| `@types/react-dom` | `19.3.0` | Tipos de React DOM |
| `eslint` | `10.15.0` | Linter |
| `typescript-eslint` | `8.73.0` | Reglas ESLint para TypeScript |
| `eslint-plugin-react-hooks` | `7.1.1` | Reglas ESLint para React Hooks |
| `vitest` | `5.1.1` | Pruebas unitarias |
| `fake-indexeddb` | `6.2.8` | Simulación de IndexedDB en pruebas |
| `@playwright/test` | `1.65.1` | Pruebas E2E |

## Futuro Tauri (NO instalar ahora)

| Paquete | Versión | Uso |
| :--- | :--- | :--- |
| `@tauri-apps/api` | `2.12.5` | Integración futura con Tauri v2 |

## Notas

- **TypeScript `6.0.3`:** se mantiene en `6.0.3` porque `typescript-eslint` `8.73` solo admite TypeScript `< 6.1`; se subirá a `7.x` cuando `typescript-eslint` lo soporte (eso será una decisión G3 por salto mayor).
- **Sin librerías de estado, iconos ni rutas:** los iconos son SVG propios.
