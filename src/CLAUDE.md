# Source layout

Three entry points, three layers. Features own business domains, `core/` holds what
they share, `commands/` orchestrates.

```
src/
├── extension.ts      activation — builds services, wires CommandManager, starts the MCP server
├── mcp-proxy.ts      → dist/mcp-proxy.js, the stdio↔socket forwarder Claude Code spawns
├── mcp-server.ts     a `vscode`-free tool-registration facade (registerProjectTools).
│                     NOT a server entry — that bootstrap was retired
├── mcp/              the file-based tool implementations behind it (`vscode`-free)
├── commands/         VS Code commands              (→ commands/CLAUDE.md)
├── features/         one directory per domain      (→ features/CLAUDE.md)
├── core/             shared infrastructure         (→ core/CLAUDE.md)
├── types/            shared interfaces, message shapes, handler contracts
└── utils/            LEGACY — only autoUpdater.ts. Takes no new code
```

The in-extension MCP server itself lives at
`features/ai/server/inExtensionMcpServer.ts`; see
[`docs/systems/mcp-server.md`](../docs/systems/mcp-server.md).

## Imports — the hybrid rule

**Cross-boundary imports use the path alias. Within-directory imports stay
relative.** Both halves are enforced by `no-restricted-imports` in
`eslint.config.mjs`.

```typescript
import { StateManager } from '@/core/state/stateManager';          // crossing a boundary
import { AuthCache } from './authCacheManager';                    // same directory
import { StateManager } from '../../../core/state';                // ✗ eslint blocks this
```

The point is not tidiness: an alias survives the file moving, and a relative path
three levels deep does not.

| Alias | Resolves to |
|---|---|
| `@/core/*` | shared infrastructure |
| `@/features/*` | feature modules |
| `@/commands/*` | VS Code commands |
| `@/types`, `@/types/*` | type definitions |
| `@/utils/*` | the legacy directory |
| `@/mcp-server` | the registration facade |

`tsconfig.json` `paths` is the source of truth for that table.

## Which direction they go

- A **feature** imports `@/core/*` and `@/types`. It does **not** import another
  feature — if two need the same thing, it moves to `core/`. Enforced by eslint.
- A **command** may import any feature. Orchestrating them is its job.
- **`core/` imports neither.** Enforced by the `layerDirection` ledger, which holds
  seven pre-existing crossings and may only shrink.

**Every module is imported by the path that DECLARES the symbol** — `@/core/*`
included. This file said the opposite until 2026-08-31 ("`@/core/*` and `@/types`
are imported through their barrels"); the rule was replaced when the curation that
justified core barrels turned out not to be happening, and the re-export indexes
are being retired against a shrink-only ledger
([ADR-022](../docs/architecture/adr/022-barrel-files.md), amended 2026-08-31).

## Build

`npm run compile` for a full build, `npm run watch:all` while iterating. esbuild
produces the extension bundle, the MCP proxy, and **eight** webview bundles — the
list lives in `WEBVIEW_ENTRIES` in `esbuild.config.js`, and a feature stylesheet
reaches only the bundles whose entry imports it.

Type checking is separate: `tsc --noEmit` for `src/`, `npm run typecheck:tests` for
the test tree. CI gates on both, and `npm run gate` runs the lot.

## Related

- [the handbook](../docs/development/handbook.md) — every convention and its enforcer
- [ADR-015](../docs/architecture/adr/015-dependency-architecture.md) — the extension
  host's dependency rules · [ADR-017](../docs/architecture/adr/017-webview-architecture.md)
  — the webview side, which is a different program
- [`../tests/README.md`](../tests/README.md) — how tests are organised and run
