# Neuro — Frontend

Next.js (App Router) · TypeScript · Tailwind · MapLibre GL.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

The foundation page checks backend connectivity and renders the provider topology and
replay scenario when `http://localhost:8000` is up. It works offline too (mirror
catalog only).

## Layout

| Path                     | Responsibility                                              |
| ------------------------ | --------------------------------------------------------- |
| `src/app/`               | routes — `(workspace)/` is the map-centric shell (M1)     |
| `src/components/map/`     | MapLibre wrapper, layers, controls, legends               |
| `src/components/panels/`  | dockable analysis panels                                  |
| `src/components/effects/` | cursor ripple field (perf-capped, reduced-motion aware)   |
| `src/components/ui/`      | primitives — Card, Tabs, Badge, Score, Sheet…             |
| `src/lib/api/`            | typed backend client                                      |
| `src/lib/providers/`      | client mirror of the Data Provider Layer (mock only)      |
| `src/store/`              | zustand stores — investigation, map, layers, ui           |
| `src/styles/tokens.css`   | design tokens — the single source of truth for colour/shape |
| `src/types/api.ts`        | backend types (`npm run gen:types` from OpenAPI)          |

## Design system

Dark-first, oceanic. Palette: Midnight Navy, Deep Teal, Sea Emerald, Bioluminescent
Cyan, Soft Coral, Warm Sand. Tokens are RGB channels so Tailwind opacity modifiers
work (`bg-surface-2`, `text-accent/70`). The map is the centrepiece; panels float over
it. Motion is restrained (140–220ms) and fully disabled under `prefers-reduced-motion`.
