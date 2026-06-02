# Progress reporting for "Regenerate AI files"

**Filed:** 2026-06-02
**Origin:** Feature request — make AI-file regeneration communicate *what's happening*, reusing the wizard's step/loading pattern.
**Status:** Planned (not started). RPTC research complete; this is the implementation plan.

## Problem

When a user clicks **Regenerate AI files** (dashboard → AI Capabilities modal), the modal swaps to a **static full-height spinner** with fixed text ("Reinstalling storefront dependencies and rewriting AI files. This can take up to a minute.") — `AiCapabilitiesModal.tsx`. There's **no per-step feedback**, so during the slow part (a storefront `npm install`) it looks stalled, and the user can't tell what's being done for their client's project.

The project-creation **wizard already solves this** with a step/loading pattern. We should **reuse that pattern** here rather than invent a second one.

## The reusable pattern (from the wizard)

End-to-end, the wizard reports progress as:

1. **Emit (extension):** a `ProgressTracker` callback → `context.sendMessage('creationProgress', { currentOperation, progress, message })`.
   - `executor.ts` defines `progressTracker(currentOperation, progress, message)` and threads it through the creation phases (`projectFinalizationService` is "phase 6 — AI files").
   - Contract: `{ currentOperation: string; progress: number /*0–100*/; message?: string }`.
2. **Transport:** `HandlerContext.sendMessage(type, data)` → webview.
3. **Listen (webview):** `vscode.onMessage('creationProgress', …)` → React state (`useMessageListeners.ts`).
4. **Render:** `LoadingDisplay` (`core/ui/components/feedback/LoadingDisplay.tsx`) — centered spinner with **`message`** (bold, the operation) + **`subMessage`** (gray, the detail).

`ProgressUnifier` (`core/utils/progressUnifier/`) is the richer primitive behind long commands; we do **not** need it here — the regen steps are discrete, so the simpler `ProgressTracker` + `LoadingDisplay` slice is the right reuse.

## The regeneration flow today

- `handleRegenerateAiFiles(context)` (`features/dashboard/handlers/aiHandlers.ts`) — has `context.sendMessage` available (it runs over the dashboard webview channel). Today it:
  1. (EDS only) `installAiDefaultsInStorefront(storefrontPath)` — runs `npm install`; **the long pole.**
  2. `generateAIContextFiles(project.path, project, extensionPath)` → `Promise.allSettled([ writeAgentsMd, writeMcpConfigs, writeSkillFiles ])` (parallel) — fast file writes.
  3. `clearMcpCache()`.
  Returns `{ success }`. No progress emitted.
- Trigger/UX: `AiCapabilitiesModal` "Regenerate AI files" button → `webviewClient.request('regenerate-ai-files', {})` → static spinner.

## Plan

Reuse the wizard contract. **Map the regen flow to discrete steps and emit progress at each.**

### Steps (what the user sees)
1. **Installing storefront dependencies** *(EDS projects only)* — the `npm install`. ~longest; this is the step that most needs feedback.
2. **Writing AGENTS.md**
3. **Writing MCP configuration**
4. **Writing skills**
5. **Finalizing** (clear MCP cache)

(Steps 2–4 are the `generateAIContextFiles` writers; step 1 is skipped for headless projects — adjust `totalSteps` accordingly.)

### Backend
- **`generateAIContextFiles(projectPath, project, extensionPath, onProgress?)`** — add an optional `onProgress?: ProgressTracker` param. **Serialize the three writers** (currently `Promise.allSettled`) so each can report its own step. Cost is negligible (tiny file writes; the `npm install` dominates) and it keeps `allSettled`-style error aggregation (collect results, then surface failures). Emit before each writer.
- **`handleRegenerateAiFiles`** — emit via `context.sendMessage(...)` before step 1 (install) and step 5 (finalize), and pass an `onProgress` into `generateAIContextFiles` that emits steps 2–4. Compute `totalSteps` (4 headless / 5 EDS) and the per-step `progress` %.

### Contract / message type
Reuse the **same shape** (`{ currentOperation, progress, message }`) and the **same `LoadingDisplay` renderer**. Use a **dedicated message type `ai-regeneration-progress`** (not the wizard's `creationProgress`) so the two surfaces never cross-talk — same pattern, distinct channel.

### UI
- `AiCapabilitiesModal` (and/or the standalone AI surface that hosts the action): listen for `ai-regeneration-progress`, hold a small `regenProgress` state, and **replace the static spinner with `LoadingDisplay`** (`message` = step name, `subMessage` = detail). The Spectrum dialog already centers/constrains it — the wizard's pattern ports cleanly to the modal (no new component needed).
- On completion/error, restore the modal (or show the existing error path).

### Tests
- `aiHandlers-setup.test.ts` — assert `handleRegenerateAiFiles` calls `context.sendMessage('ai-regeneration-progress', …)` with the expected ordered payloads (install → finalize), and that EDS vs headless changes `totalSteps`/skips step 1.
- `projectFinalizationService` test — `generateAIContextFiles` invokes `onProgress` once per writer, in order, and still aggregates writer failures (serialized but `allSettled`-equivalent error handling).
- Webview — listener updates state; `LoadingDisplay` renders the step name + detail. (Extend the existing `LoadingDisplay` test / add a small listener test.)

## Key decisions

1. **Serialize the three writers** to get per-step progress (recommended) vs. keep them parallel and report a single coarse "Writing AI files" step. → Serialize; the writes are trivially fast and granular steps are the whole point.
2. **Dedicated `ai-regeneration-progress` message type** (recommended) vs. reuse `creationProgress`. → Dedicated, same shape — avoids any chance of the dashboard and a (hypothetically mounted) wizard listener interfering.
3. **Reuse `LoadingDisplay` in the modal** (recommended) vs. a new compact component. → Reuse; consistent visual language, zero new UI surface.

## Open questions / related

- **Home context:** "Regenerate AI files" currently regenerates the *project* context. With the home-AI work (single home Chat at the projects root, `ensureHomeAiContext`), should regen also refresh the **home** context? Likely a separate concern (home context is (re)written on activation) — flag for the home-AI phase, out of scope here.
- **npm install sub-progress:** step 1 is the long pole; a coarse "Installing dependencies…" is sufficient. Surfacing `npm` sub-progress via `ProgressUnifier` is gold-plating — defer unless users ask.

## Effort / risk

**Small–medium, low risk.** One handler + one service signature (`onProgress`) + the modal listener/render + tests. No new infrastructure — it's a straight reuse of the wizard's `sendMessage` + `LoadingDisplay` slice. Ships as one PR.
