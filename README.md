# CytoLens

**See every cell clearly.**

CytoLens is a cross-platform flow cytometry analysis suite — desktop-native via Tauri, browser-capable, fully offline-first.

## Packages

| Package | Description |
|---|---|
| `@cytoflow/core` | FCS parsing, gating engine, transforms, statistics |
| `@cytoflow/wasm` | Rust/WASM performance-critical computation |
| `@cytoflow/ui` | React component library (WebGL/WebGPU plots) |
| `@cytoflow/ai` | AI-assisted gating and interpretation |
| `@cytoflow/cloud` | Optional Supabase sync backend |
| `@cytoflow/desktop` | Tauri v2 desktop shell |
| `@cytolens/web` | Vite web app entry point |

## Quick start

```bash
pnpm install
pnpm dev
```

## Tech stack

- pnpm workspaces monorepo
- React 18 + TypeScript 5 + Vite
- Tauri v2 (desktop)
- Tailwind CSS + shadcn/ui
- Zustand state management
- Vitest
- Rust + wasm-pack (WASM modules)

## Licence

AGPL-3.0 — see [LICENSE](LICENSE).
