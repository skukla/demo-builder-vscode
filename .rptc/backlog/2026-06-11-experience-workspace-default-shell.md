# Make Experience Workspace the default authoring shell + ship Quick Edit patches

**Status:** Backlog — research complete, scope estimated, 5 design questions open for `/rptc:plan`.
**Filed:** 2026-06-11
**Origin:** Field discovery — owner and Leah found that DA.live content can be authored inside Adobe Experience Workspace (the new canvas/WYSIWYG editor) by setting a single config key. Owner asked whether we should make Workspace the new default rather than just opt-in. Research surfaced the integration is much smaller than the "alpha new shell" framing suggested AND that every active EDS storefront template is missing Quick Edit, which Workspace requires. Pushed from `.115` (already shipped) to `.116`.

---

## The architectural insight

Experience Workspace is **not a separate shell at `experience.adobe.com`** — it's a new canvas/WYSIWYG editor route at `https://da.live/canvas#/<org>/<site>/<path>`, built by the DA.live team, using the same IMS auth (`client_id=darkalley`) as the existing `/edit` doc editor. Switching to it is mostly a **one-config-key change** to the DA.live org config (the `editor.path` key we already write today), plus a project-side Quick Edit script.

What this means in practice: we don't have a new authoring surface to integrate with — we have a new value to write to an endpoint we already write to. The "where does this slot in?" question that defines most integrations has a free answer: it slots into `applyDaLiveOrgConfigSettings` at `src/features/eds/handlers/edsHelpers.ts:667-707`, the same function that writes the Universal Editor punch-out URL today.

The Quick Edit requirement is the bulk of the work. Every active EDS template (CitiSignal/Custom on `hlxsites/aem-boilerplate-commerce`, B2B on `adobe-commerce/boilerplate-b2b-template`, BuildRight on `skukla/buildright-eds`, Isle5 on `stephen-garner-adobe/isle5`) is **missing Quick Edit**. Workspace's iframe-preview-sync requires `tools/quick-edit/quick-edit.js` + a `sidekick.json` plugin entry. Without these, the canvas shows blank. Patches need to land in `skukla/eds-demo-patches` and be applied to every storefront create + reset path.

---

## What ships in `.116`

### User-facing change summary

| Before `.116` | After `.116` |
|---|---|
| "Author in DA.live" → classic doc editor | "Author in DA.live" → Experience Workspace canvas (WYSIWYG default) |
| One view: doc structure | Three views: Canvas / Content (the doc editor) / Split |
| No AI chat inside the editor | AI chat panel built in (alpha — capabilities evolving) |
| Same DA.live token, same sign-in | Same token, same sign-in |
| `da.live/edit#/...` URL | `da.live/canvas#/...` URL |
| `editor.path` → Universal Editor punch-out URL | `editor.path` → Workspace URL |
| One-click UE punch-out button from inside the doc editor | UE punch-out button **gone** from Workspace toolbar (UE accessible via direct URL or multi-row config) |

### Components

| Component | Purpose | Where it lives |
|---|---|---|
| `demoBuilder.daLive.authoringShell` enum setting | Global default — `experience-workspace` / `da-live`, default `experience-workspace` | `package.json` |
| Configure-screen dropdown | Per-project override of global default | `src/features/dashboard/` (Configure handler + UI) |
| `getEdsAuthoringShellUrl(project)` (rename or branch in existing `getEdsDaLiveUrl`) | URL helper consulted by all "Author in DA.live" surfaces | `src/types/typeGuards.ts` |
| `applyDaLiveOrgConfigSettings` branch on shell | Writes the appropriate `editor.path` value | `src/features/eds/handlers/edsHelpers.ts` |
| `ensureSidekickQuickEditPlugin(daLiveOrg, daLiveSite)` | Configuration Service write for the sidekick plugin entry | New function in `src/features/eds/` |
| Quick Edit `scripts.js` patch | 3 modifications: export `loadPage`, add sidekick event listener, add URL `?quick-edit` IIFE | New entry in `skukla/eds-demo-patches` |
| Quick Edit shim file patch | New file `tools/quick-edit/quick-edit.js` (~10-line dynamic-import shim) | New entry in `skukla/eds-demo-patches` |

### Scope estimate

| Item | Lines | Effort |
|---|---|---|
| `demoBuilder.daLive.authoringShell` enum + Configure-screen dropdown | ~80 | Half-day |
| URL helper branch on setting | ~15 | Trivial |
| `applyDaLiveOrgConfigSettings` writes Workspace `editor.path` | ~20 | Trivial |
| Configure-screen Apply re-runs config write on shell change | ~30 | Trivial (reuses existing path) |
| Quick Edit `scripts.js` canonical patch (authored in patches repo) | ~30 patch + ~15 patch metadata | Half-day |
| Quick Edit shim file-add patch | ~10 shim + patch metadata | Trivial |
| `ensureSidekickQuickEditPlugin` (Configuration Service write) | ~40 | Half-day |
| Tests | ~80 | Half-day |
| **Total** | **~330 lines** + 2 new patches | **~1.5-2 days** |

---

## Idempotency design — load-bearing requirement

The Quick Edit patches MUST be idempotent. Some storefronts may have Quick Edit added manually or via author kit templates we don't control. Running the patch against a storefront that already has Quick Edit must produce zero behavior change and zero error.

Three layers, each with its own mechanism:

| Layer | What's modified | Idempotency check |
|---|---|---|
| `scripts/scripts.js` modifications | Source code (3 distinct edits) | Marker detection — `custom:quick-edit` event name, `?quick-edit` URL check, `export async function loadPage`. All three present → skip. Partial → log "partial Quick Edit detected; preserving" and skip. |
| `tools/quick-edit/quick-edit.js` shim | New file | File existence + byte-for-byte comparison against canonical shim. Exists + matches → skip. Exists + differs → log "customized shim; preserving" and skip. Doesn't exist → write. |
| Sidekick plugin registration | Configuration Service entry | Read-modify-write merge: fetch current sidekick config, check for entry with `id: "quick-edit"`. Present → skip the write. Same pattern `applyDaLiveOrgConfigSettings` uses against DA.live's `/config/<org>/`. |

Acceptance criterion for the plan cycle: a storefront that ALREADY has Quick Edit (e.g., from author kit template) goes through `.116`'s setup with no errors, no overwrites, no warnings beyond "Quick Edit already present; skipping."

---

## Coupling audit

Auditing what `.116` introduces vs extends:

| Coupling | Pre-`.116` | Post-`.116` | New, or extension? |
|---|---|---|---|
| Builder → patches repo | Reads patch definitions via `codePatchRegistry`; uses `lkgFile`, `lkgReader` | Same shape, plus 2 new patches. Possibly a small schema extension for `skipIfPresent` markers (open design question 1 below). | Extension. No new wire. |
| Builder → DA.live `/config/<org>/` | Writes `aem.repositoryId` + `editor.path` via `applyOrgConfig` | Same write path, different `editor.path` value | Extension. Same endpoint, different value. |
| Builder → AEM Configuration Service | Writes site registration + permissions | Adds `ensureSidekickQuickEditPlugin` write | Extension. Same service, additional write site. |
| Storefront → Quick Edit shim | None | Storefront depends on `da.live/nx/public/plugins/quick-edit/quick-edit.js` (the shim dynamically imports from there at runtime) | **New, but adopting an Adobe convention.** This is the canonical pattern across every Quick-Edit-enabled site. If Adobe relocates that endpoint, every patched storefront breaks — risk is borne by all Adobe storefronts, not just us. |
| User Configure-screen choice → DA.live config state | None | Switching the authoring shell setting writes a different `editor.path` to DA.live on Apply | **New, but it's the feature.** Same pattern as other Configure-screen settings → write on Apply. |

No new external wires. The biggest "newness" is the canonical Adobe convention we're adopting (the Quick Edit shim's dynamic import), which is an Adobe-ecosystem dependency rather than a coupling we created.

---

## Settings architecture: hybrid model

| Layer | Setting | Behavior |
|---|---|---|
| **VS Code Settings** | `demoBuilder.daLive.authoringShell` — enum `experience-workspace` / `da-live`, default `experience-workspace` | Read by wizard at project creation; read by Configure screen as default when project has no override |
| **Per-project Configure screen** | Dropdown reading/writing project manifest override field | Empty/unset → follow global default. Set → override global. |
| **Apply button** | Re-runs `applyDaLiveOrgConfigSettings` for the project | Writes `editor.path` with the chosen shell URL. Non-fatal failure pattern preserved. |

User mental model: "Globally I want Workspace. For this one demo, I want classic DA.live. Configure → switch → Apply → done." No project recreate, no reset.

---

## Design questions for `/rptc:plan` (not answered here)

These are the architectural decisions the planning cycle needs to resolve. Each has tradeoffs; locking them in deliberately rather than at implementation time is the value of doing the plan cycle.

### Q1. Patch idempotency — schema extension or marker-only patches?

**Path A:** Add a `skipIfPresent` field to the patches repo schema. Patch applier reads it and short-circuits before applying. Cohesive — patch owns its idempotency. Small schema change; existing patches stay backwards-compatible.

**Path B:** Patches authored to be self-idempotent via match patterns that won't fire if the marker is already there. No schema change. Patch transformation specs get noisier.

Recommend Path A but defer the call to planning. The drift gate in the patches repo needs to understand the new field if we go Path A.

### Q2. Multi-row UE-on-specific-paths — in scope or deferred?

Multi-row `editor.path` config (Workspace as default, UE for specific subpaths) is technically supported by DA.live (longest-prefix-wins resolution). The question is whether we expose UI for it in `.116`.

**In scope:** ~150 more lines for per-path mapping UI in Configure screen. Useful for SCs who need both editors. Doubles Configure-screen complexity for a feature most users won't touch.

**Deferred:** Single-row Workspace ships. UE accessible via direct URL; document the URL pattern in AGENTS.md so AI agents can point users there. Users who need multi-row write the rows by hand in DA.live config sheet.

Recommend deferred. Owner's lean as of `.115` close is also "deferred"; pending final confirmation.

### Q3. Per-project Configure-screen override storage

Where on the project manifest does the per-project `authoringShell` value live? Options:

- New top-level field on the project state (`project.authoringShell: 'workspace' | 'classic' | undefined`)
- New field on `EdsStorefrontMetadata`
- Stored in DA.live org config sheet only (read back from there each time)

Affects migration story: existing projects without the field default to the global setting; users who explicitly override get their override persisted.

### Q4. Configuration Service write failure handling

If `ensureSidekickQuickEditPlugin` fails (network, auth, Configuration Service unavailable), do we:

- **Surface a warning, continue** — matches `applyDaLiveOrgConfigSettings`'s non-fatal pattern. Storefront ships without sidekick plugin; user can manually trigger a re-apply. Probably right.
- **Block project creation** — guarantees Workspace works on first use, at the cost of a brittle dependency.

Recommend non-fatal but the plan needs to commit explicitly.

### Q5. Existing-project migration

For projects created on `.115` or earlier without Quick Edit, what's the upgrade path?

- **Run on next project Reset** — opt-in via existing workflow. Simple. Users who never Reset stay on classic until they do.
- **Add a one-shot palette command** — "Migrate to Experience Workspace." Useful for SCs who want to upgrade an existing project without resetting.
- **Run automatically on first dashboard load after upgrade** — risky (silent config change), could surprise users.
- **Skip migration; new projects only** — simplest. Existing projects stay as-is until owner manually triggers something.

Recommend Reset-only for `.116`, with a palette command as `.117` follow-up if SCs ask for it.

---

## Out of scope for `.116` (deliberate, may revisit later)

- **Per-path multi-row UE config UI** (Q2 above; defer pending owner confirmation)
- **A "Use Classic" sub-menu item** on the dashboard for per-launch flip (nice-to-have; just rely on the Configure-screen override + Apply path)
- **Automatic detection of Workspace canvas being broken at runtime** (e.g., the user has Workspace configured but Quick Edit was somehow removed and the canvas is blank — surface a diagnostic)
- **Workspace's `ew.canvasDefaultView` flag exposure** (canvas / content / split default) — let DA.live's own per-user setting handle this; don't add an extension setting
- **Codex sequencing implications** — the AI engine choice in `demoBuilder.ai.engine` is independent of the authoring shell choice. The prereqs reframe and Claude detection work tracked separately.

---

## Sequencing relative to other in-flight work

- **Prereqs architecture reframe** (`.rptc/backlog/2026-06-11-prereqs-architecture-reframe.md`) — independent of this work. Both can proceed in parallel or in sequence; no shared files.
- **Claude detection + install** (`.rptc/backlog/claude-cli-detection-and-install/`) — blocked on prereqs reframe; independent of this.
- **EDS namespace picker** (`feature/eds-namespace-picker` branch, parked) — independent of this; ship decision still open.
- **Decouple project from workspace folder** (`.rptc/backlog/2026-05-30-decouple-project-from-workspace.md`) — independent of this; carries its own cleanup obligation for the dual-listen MCP shim.

This work has no architectural dependencies on the others. It can start as soon as `/rptc:plan` runs.

---

## Field-relevant notes for the user-facing release announcement

When `.116` ships, the release announcement should:

- **Lead with the headline visible change** — "Author in DA.live" now opens Workspace
- **Acknowledge alpha status honestly** — URL contract stable, features inside the editor evolving
- **Surface the escape hatch** — VS Code Settings → `demoBuilder.daLive.authoringShell` → `da-live` to revert globally; Configure screen for per-project override
- **Note the UE access change** — punch-out button gone from Workspace toolbar; UE accessible via direct URL (provide the pattern)
- **Credit any field reporters** — owner + Leah for the discovery
- **Flag Quick Edit-related improvements** — even projects that don't switch to Workspace get the Quick Edit patches as a base improvement (it enables iframe preview sync for the classic editor too)

A draft of this announcement is in the conversation history that produced this backlog (search for "Here's the user-facing change summary"). Pull from there when writing release notes.

---

## Kickoff prompt

```
Run /rptc:plan on the Experience Workspace + Quick Edit integration.
Context files:
  - .rptc/backlog/2026-06-11-experience-workspace-default-shell.md (this file)
  - skukla/eds-demo-patches (the patches repo — clone for inspection)

The user-facing change summary, scope estimate, idempotency design, coupling
audit, and hybrid setting model are all captured above and locked. The plan
cycle should NOT re-litigate them.

Five design questions remain (Q1-Q5 in "Design questions for /rptc:plan"):

  Q1. Patch idempotency — Path A (schema extension) vs Path B (marker-only patches)
  Q2. Multi-row UE config UI — in scope or deferred
  Q3. Per-project override storage location on project manifest
  Q4. Configuration Service write failure handling (non-fatal vs blocking)
  Q5. Existing-project migration path

Plan cycle should resolve each explicitly with owner approval before
proposing implementation. The idempotency requirement is load-bearing —
acceptance criterion: a storefront that ALREADY has Quick Edit goes through
.116's setup with no errors, no overwrites, no warnings beyond "Quick Edit
already present; skipping."

Sequence target:
  - Step 1: Patches repo work (authoring + idempotency schema decision)
  - Step 2: New settings (package.json + Configure screen UI)
  - Step 3: URL helper branch + applyDaLiveOrgConfigSettings update
  - Step 4: ensureSidekickQuickEditPlugin (Configuration Service write)
  - Step 5: Wizard + dashboard wiring + tests

Output should be a step-NN.md per step under
.rptc/plans/experience-workspace-default-shell/ with the implementation
specifics for each.

Block on owner approval before proposing implementation.
```

---

## Constraints

- **Idempotency is load-bearing.** Tests must cover the "already has Quick Edit" path. Acceptance criterion stated above must hold.
- **Don't re-litigate the locked design** (hybrid setting model, scope estimate, idempotency layer breakdown). Plan cycle implements; the five open questions are where design effort goes.
- **Preserve the non-fatal write envelope** for both `applyDaLiveOrgConfigSettings` and the new `ensureSidekickQuickEditPlugin`. Project creation must not block on a Configuration Service failure for the sidekick plugin entry.
- **Reuse the existing patches mechanism.** Don't introduce a parallel install system; Quick Edit patches go through the same `codePatchRegistry` flow ADR-006 established.
- **No new endpoints we don't already talk to.** All writes target services we already integrate with (DA.live `/config/`, AEM Configuration Service).
