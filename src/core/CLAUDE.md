# Core Infrastructure

Shared capability every feature can reach: command execution, logging, state,
webview messaging, validation, base classes. Reached as `@/core/*`.

This file is a map plus the handful of behaviours that are not obvious from the
source. It deliberately does not list each module's exports — the compiler declares
those, and a hand-copied list goes stale without anything noticing.

```
core/
├── auth/            # ensureAdobeIOAuth — the check → warn → Sign In → verify guard
├── base/            # BaseCommand, BaseWebviewCommand, webviewPanelManager (→ base/README.md)
├── build/           # build stamp: which checkout is running
├── cache/           # TTL helpers with jitter
├── commands/        # core-owned dev commands (ResetAll, ResetAiOnboarding)
├── communication/   # WebviewCommunicationManager (→ communication/README.md)
├── config/          # ConfigurationLoader, configFileGenerator
├── di/              # ServiceLocator
├── handlers/        # dispatchHandler and friends
├── logging/         # DebugLogger, ErrorLogger, StepLogger (→ logging/README.md)
├── shell/           # CommandExecutor and the concurrency machinery (→ shell/README.md)
├── state/           # StateManager and project state (→ state/README.md)
├── ui/              # shared React for webviews (→ ui/hooks/CLAUDE.md)
├── utils/           # TIMEOUTS, progressUnifier, disposableStore, …
├── validation/      # security + field validation (→ validation/README.md)
├── vscode/          # watcher wrappers
└── constants.ts
```

## Which direction imports go

**Nothing here imports `@/features` or `@/commands`.** Features build on core — 367
files do — and commands orchestrate both. Core knows about neither, which is what
keeps the dependency graph acyclic and makes "if two features need it, move it to
core" a safe answer rather than a way to close a loop.

Enforced by the `layerDirection` ledger in
`tests/sop/architecture-rules.exemptions.json`. **Seven files predate the rule and
the set may only shrink** — a new crossing fails the build, and so does a ledger row
for a file that no longer violates. Clearing one means fixing the file *and* deleting
its row.

The seven are not all the same problem, and the ledger says so per row:

| | |
|---|---|
| `commands/ResetAllCommand.ts`, `commands/ResetAiOnboardingCommand.ts` | **Misplaced, not miswritten.** A command orchestrating features is doing its job; it is in the wrong directory. Fix by moving to `src/commands/` |
| `di/serviceLocator.ts` | `import type` only — no runtime coupling, no cycle. Move the two interfaces to `@/types`, or ratify: a locator has to name what it locates |
| `state/apiOwners.ts`, `state/projectFileLoader.ts`, `state/projectStateSync.ts` | Real runtime crossings into `features/components` |
| `utils/progressUnifier/ProgressUnifier.ts` | Imports `InstallStep`, which looks like a TYPE — probably clears with `import type` alone |

Cross-boundary imports also use the path alias, never a relative path, enforced by
`no-restricted-imports` in `eslint.config.mjs`.

The rule reached the handbook on 2026-08-30. Before that it lived only in this file,
stated as law with a "❌", present in no ADR or convention, enforced by nothing, and
already violated seven times.

## Handler dispatch

Features declare handler maps as object literals and route through one dispatcher,
so a message type has exactly one home:

```typescript
export const meshHandlers = defineHandlers({
    'check-api-mesh': handleCheckApiMesh,
    'delete-api-mesh': handleDeleteApiMesh,
});

const result = await dispatchHandler(meshHandlers, context, messageType, data);
```

The same maps back the MCP tools, which is why a handler that needs a panel cannot
be exposed to agents — see the `mcp-tool-authoring` skill.

## Behaviours worth knowing before you touch them

**`ProcessCleanup` kills the whole tree, not the process.** Event-driven, with no
polling or grace period: SIGTERM first, SIGKILL as fallback, `pkill -P` on
macOS/Linux and `taskkill /T` on Windows. Killing only the parent leaves the demo's
child processes holding their ports, which is the bug this exists to prevent.

**`DisposableStore` disposes LIFO.** Last in, first out, and it is idempotent, so
calling `dispose()` twice is safe. `BaseCommand` and `BaseWebviewCommand` both use
it; adding a subscription without registering it there is how listeners leak.

**`EnvFileWatcherService` suppresses its own writes.** It hashes content to tell a
real edit from a rewrite, ignores writes the Configure UI made itself, and holds a
grace period during demo startup. Without those three it fires on every write the
extension performs and the user gets a notification storm.

**Cache TTLs carry jitter** (`getCacheTTLWithJitter`) so expiry is not a
predictable instant.

**Timeouts come from `TIMEOUTS`** in `@/core/utils/timeoutConfig`. A literal in a
`setTimeout` or an executor call is a defect the SOP scan reports.

## Adding a module here

The bar is **used by two or more features, with no feature-specific logic in it.**
One feature needing something is not a reason to move it to core; it is a reason to
leave it where it is until a second one asks.

Give it an `index.ts` that states the public API, and a README only if the module
has behaviour a reader would otherwise have to infer — the ones above earned theirs.

## History

`core/` absorbed the former `src/utils/` and `src/shared/`. Both are gone;
`src/utils/` retains only `autoUpdater.ts` and takes no new code.

## Related

- [ADR-015](../../docs/architecture/adr/015-dependency-architecture.md) — the
  extension-host architecture this layer serves, and the authority on where code goes
- [`../features/CLAUDE.md`](../features/CLAUDE.md) · [`../CLAUDE.md`](../CLAUDE.md)
