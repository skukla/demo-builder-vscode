# Republish affected projects when an EW-URL-affecting setting changes

**Status:** Designed, paused 2026-06-12 (decisions captured below). Not started.

## Problem

EW-related `demoBuilder.daLive.*` settings are only applied to a project's
published DA config through the **Configure webview's save path**
(`configure.ts`: `applyDaLiveOrgConfigSettings` → site-scoped `editor.path` →
`republishStorefrontConfig`). When an end user changes one of these settings in
**VS Code Preferences**, existing projects' DA `editor.path` goes stale with no
re-apply. There is no `onDidChangeConfiguration` listener for `daLive.*` today
(only AI / projects-list refresh listeners exist).

## Trigger scope (decided)

Fire **only when a change affects the EW URL specifically** — i.e. the settings
that feed `getEdsDaLiveUrl` / `buildEditorPathValue`:
- `demoBuilder.daLive.ewCanvasBranch` (the `?nx=` branch → `editor.path` + Author URL; global, affects every EW project)
- `demoBuilder.daLive.authoringExperience` (global **default**; only affects projects with NO per-project override — respect `resolveProjectAuthoringExperience` precedence)

Do NOT fire for unrelated daLive settings (`defaultOrg`, `aemAuthorUrl`, `IMSOrgId` — unless we later confirm `IMSOrgId` changes the DA.live Classic punch-out `editor.path` enough to warrant it; revisit).

## Behavior (decided)

- **Scope = Prompt to confirm.** Detect the affected EDS project(s) (respecting per-project authoring overrides), then prompt: "N project(s) affected by this setting change — republish now?" Let the user confirm/pick. Avoids surprise background DA.live + CDN writes.
- **Feedback = Notify on completion.** After re-applying, show a toast ("Re-applied EW config to <project>") — mirrors Configure's feedback. A live CDN write should never be invisible.
- Reuse the exact Configure flow: `applyDaLiveOrgConfigSettings(...)` (site-scoped `editor.path`) → `republishStorefrontConfig(...)`. Do not duplicate logic.

## Open questions for implementation

- Where to register the listener (extension activation; dispose on deactivate).
- How to enumerate affected projects (all known EDS projects vs only the open dashboard's project) and resolve each one's authoring experience to decide if the changed setting actually alters its URL.
- Debounce rapid settings edits.

## Related

- `getEdsDaLiveUrl` / `buildEditorPathValue` — the EW URL builders (see `src/types/typeGuards.ts`, `src/features/eds/handlers/edsHelpers.ts`).
- The EW canvas doc-path fix (extensionless `/index`) shipped in 1.0.0-beta.118.
