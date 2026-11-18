# Sistema de Diseño — «Estudio táctil»

Sistema neumórfico de alto contraste basado en [docs/wireframe/neo.css](wireframe/neo.css) y las vistas en [docs/wireframe/](wireframe/).

## 1. Principios

- **Luz arriba a la izquierda:** las sombras proyectan hacia abajo y a la derecha (`--lo`), con brillo superior izquierdo (`--hi`).
- **Tres elevaciones:**
  - **Relieve** (`.raised`): contenedores y tarjetas principales.
  - **Botón** (`.raised-sm` / `.btn` / `.sync`): elementos que se tocan.
  - **Hundido** (`.well` / `.pill` / `.saved`): áreas de lectura, barras de progreso, contenedores segmentados y estados activos.
- **Objetivos táctiles:** mínimo `48 px` de alto/ancho en todo control interactivo.
- **Zona del pulgar:** acciones principales abajo, lectura y onda arriba.
- **Contraste:** mínimo `4.5:1` en texto sobre `--bg`.

## 2. Tokens de diseño (desde `neo.css`)

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--bg` | `#E6E2DC` | Fondo base |
| `--hi` | `#FFFFFF` | Brillo superior izquierdo |
| `--lo` | `#C4BEB4` | Sombra inferior derecha |
| `--ink` | `#25232B` | Texto principal |
| `--mute` | `#5C5964` | Texto secundario y etiquetas |
| `--acc` | `#B53A22` | Acento primario (sincronizar, activo) |
| `--ok` | `#1F7A6D` | Estado guardado / completado |
| `--warn` | `#9A6400` | Advertencia |

### Tipografías (autoalojadas)

- **UI:** `Manrope` (`400`, `600`, `700`, `800`).
- **Tiempos y código:** `JetBrains Mono` (`700`, `font-variant-numeric: tabular-nums`).
- **Regla de producción:** las fuentes deben servirse **autoalojadas** con `font-display: swap`. No cargar desde Google Fonts en producción (el wireframe las usa solo por ser demo estática).

## 3. Mapeo a `tailwind.config.*`

```typescript
// tailwind.config.ts (referencia de tokens)
colors: {
  bg: '#E6E2DC',
  hi: '#FFFFFF',
  lo: '#C4BEB4',
  ink: '#25232B',
  mute: '#5C5964',
  acc: '#B53A22',
  ok: '#1F7A6D',
  warn: '#9A6400',
},
fontFamily: {
  sans: ['Manrope', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
},
boxShadow: {
  raised: '7px 7px 16px #C4BEB4, -7px -7px 16px #FFFFFF',
  'raised-sm': '3px 3px 7px #C4BEB4, -3px -3px 7px #FFFFFF',
  'raised-xl': '5px 5px 12px #C4BEB4, -5px -5px 12px #FFFFFF',
  well: 'inset 4px 4px 9px #C4BEB4, inset -4px -4px 9px #FFFFFF',
  'well-sm': 'inset 2px 2px 5px #C4BEB4, inset -2px -2px 5px #FFFFFF',
  sync: '8px 8px 18px #C4BEB4, -6px -6px 14px #FFFFFF',
},
```

## 4. Componentes en `src/ui/`

- `RaisedButton`: botón neumórfico estándar (`56 px` o `44 px` en variante `sm`, variantes `default`, `acc`, `ghost`).
- `IconButton`: botón cuadrado o redondo de `48 px` (`64 px` en variante `xl`, estado hundido `on`).
- `WellPanel`: contenedor hundido (`.well`) para listas de letras, onda o métricas.
- `Segmented`: selector segmentado hundido con pestaña activa en relieve.
- `SyncButton`: botón gigante de sincronización (`104 px` de alto, gradiente `#C8452D` → `#A93219`, `onPointerDown` / `onPointerUp`).
- `Lamps`: semáforo de 3 luces (rojo, ámbar, verde) para Pre-Roll.
- `Keycap`: tecla física con bisel inferior para mostrar atajos en escritorio.
- `ProgressBar`: barra hundida con relleno `--ok` o `--acc`.
- `NavBar`: navegación inferior móvil fija en la zona del pulgar.
- `Pill`: insignia hundida para tiempos, estados y etiquetas.

## 5. Pantallas

- **Sincronizar línea** ([Main.dc.html](wireframe/Main.dc.html)): onda superior, lista de líneas con línea actual en relieve y botón gigante.
- **Palabra con Pre-Roll** ([Palabra.dc.html](wireframe/Palabra.dc.html)): semáforo (`Lamps`), palabra objetivo a `72 px`, botón repetir Pre-Roll (`-2.5 s`) y botón gigante.
- **Catálogo** ([Catalogo.dc.html](wireframe/Catalogo.dc.html)): tarjetas de «Mis Transcripciones» con barras de progreso de líneas y palabras.
- **Lupa e Inspector** ([Lupa.dc.html](wireframe/Lupa.dc.html)): onda ampliada con bordes arrastrables e inspector `±10 ms` y `±50 ms`.
- **Escritorio** ([Escritorio.dc.html](wireframe/Escritorio.dc.html)): diseño multipanel (`1280x800`) con atajos `Keycap`.
- **Letra y Exportar:** pendientes de diseño detallado; deben seguir exactamente este mismo sistema de tokens, elevaciones y objetivos táctiles de `48 px`.
