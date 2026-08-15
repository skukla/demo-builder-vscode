# Step 05 — One add/remove system (retire the singular guarded path)

**Purpose:** Two live add/remove systems exist side by side: the legacy **singular** path
(`appComponentManager.addAppComponent`/`removeAppComponent`, guarded to ONE app) and the **keyed**
runner (`addAppBuilderComponent`/`removeAppBuilderComponent`, N). Retire the singular path and its
one-app guard so there is exactly one add/remove system supporting N integrations.

**Prerequisites:** Steps 01–04.

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/features/app-builder/services/appComponentManager.ts:134-138` — the one-app guard
  (`if (getAppBuilderInstance(project)) return {…'already has a custom integration'}`); `:149-152` add;
  `:202-230` `removeAppComponent` (clears singular `appState`).
- `src/features/app-builder/services/appBuilderComponentRunner.ts:240` `addAppBuilderComponent`,
  `:373-402` `removeAppBuilderComponent` (the keyed targets, per-id undeploy + save).
- `src/features/dashboard/handlers/dashboardHandlers.ts:1081-1091` — BOTH systems registered
  (`addApp`/`removeApp` singular + `addAppBuilderComponent`/`removeAppBuilderComponent` keyed).
- `src/types/typeGuards.ts:528-533` — `getAppBuilderInstance` (the singular guard reader; remove usages).

## Tests to write FIRST (RED)

- [ ] Adding a SECOND custom integration succeeds (no "already has a custom integration" rejection).
- [ ] Add routes through the keyed `addAppBuilderComponent` (installs to `components/<id>/`, keyed state).
- [ ] Remove one integration undeploys + clears ONLY its keyed entry; siblings remain.
- [ ] The legacy `addApp`/`removeApp` singular handlers are gone (or delegate to the keyed path); no
      caller depends on the one-app guard.

## Files to create / modify

- MODIFY/REMOVE the singular `addApp`/`removeApp` handlers → delegate to keyed, or delete once callers
  migrate. Drop the `getAppBuilderInstance` one-app guard in `appComponentManager.ts`.
- MODIFY `dashboardHandlers.ts:1081-1091` — collapse to the keyed handlers only.
- Update tests that assert the guard (e.g. `appComponentManager.test.ts` "already has" test) — the guard
  is intentionally removed.

## Acceptance criteria

- N custom integrations can be added/removed via every surface; one add/remove system remains.
- No architecture-duplication between singular and keyed add/remove.

## Risks

- A lingering caller on the singular handler (grep `addApp`/`removeApp` message dispatch). Migrate or
  delete; do not leave a dead guarded path (no soft deprecation).
