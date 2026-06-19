# v1 Template-Patch System — Recovered Prior Art (Step 1 starting point)

**Recovered:** 2026-06-10, from full git history after `git fetch --unshallow` (the session clone was shallow,
history from 2026-03-02 only; v1 lived 2026-01-20 → 2026-02-01).
**Era:** added `6026b695`, CDN-publish fix `cfbd05ba`, removed `f6a7d029` + `06dd6549`.
**Recover any file at the pre-removal state:** `git show 'f6a7d029^:<path>'`

> ⚠️ A fresh clone for the TDD phase must run `git fetch --unshallow` first or none of these refs resolve.

## File inventory (all at `f6a7d029^`)

| Path | Role |
|---|---|
| `src/features/eds/services/templatePatchRegistry.ts` (204 lines) | The engine: types, registry load, `applyTemplatePatches()` |
| `src/features/eds/config/template-patches.json` (+ `.schema.json`) | Patch **metadata**: `{id, filePath, description}` per patch |
| `src/features/eds/config/patches/index.ts` | Map of patch id → payload module |
| `src/features/eds/config/patches/{header-nav-tools-defensive, aem-assets-sku-sanitization, product-link-sku-encoding, product-link-sku-slash-encoding, personalization-auth-guard}.ts` | Patch **payloads**: each exports `searchPattern` + `replacement` |
| `tests/features/eds/services/templatePatchRegistry.test.ts` | The v1 test suite — seed material for Step 1 RED phase |
| `src/features/eds/handlers/edsHelpers.ts` (Template Patch Helpers section) | `getAppliedPatchPaths()` + live-CDN publish of patched code files |
| `src/features/eds/handlers/storefrontSetupHandlers.ts`, `src/features/{dashboard,projects-dashboard}/handlers/dashboardHandlers.ts` | Call sites (create + reset paths) |

## The v1 shape (verified — matches the ADR's description exactly)

```ts
export interface TemplatePatch {
    id: string;            // referenced from demo-packages.json "patches": [...]
    filePath: string;      // repo-relative target, e.g. 'blocks/header/header.js'
    description: string;
    searchPattern: string; // anchored precondition (exact string match)
    replacement: string;
}

export interface PatchResult {
    patchId: string;
    filePath: string;
    applied: boolean;
    reason?: string;       // e.g. 'Search pattern not found (file may already be patched or has changed)'
}
```

Definitions were split: metadata in `template-patches.json` (JSON-schema validated), payload strings in
`config/patches/{id}.ts` modules (chosen for syntax highlighting of embedded JS), merged at load by
`loadPatches()` into `TEMPLATE_PATCHES`.

## The v1 apply algorithm (`applyTemplatePatches`, lines ~119–204)

1. Inputs: `templateOwner/templateRepo`, `patchIds` (from the package's `"patches": []` field),
   a mutable `fileOverrides: Map<string, string>`, logger.
2. Unknown patch ids in config → `logger.warn`, skipped.
3. Per patch: take the file from `fileOverrides` if a previous patch already touched it (**multiple patches per
   file compose**), else fetch `https://raw.githubusercontent.com/{owner}/{repo}/main/{filePath}`.
4. Precondition: `content.includes(searchPattern)`; on miss → `applied:false` with reason
   `'Search pattern not found (file may already be patched or has changed)'` — non-fatal, loop continues.
5. Apply: single `content.replace(searchPattern, replacement)`; write into `fileOverrides`; record result.
6. All errors per-patch → caught, `applied:false` + reason; never throws past a patch.

So v1 was already **proceed-and-warn shaped** (non-fatal per-patch results) — consistent with owner decision D1;
v2 adds the user-facing toast on top of the same result discipline.

## Wiring

- `demo-packages.json` carried `"patches": []` per EDS storefront entry, sibling to
  `contentPatches`/`contentPatchSource` (verified at `f6a7d029^`, lines 63/92 — empty arrays at removal time,
  consistent with the patches having been baked into the fork by `911b6ac8` two days earlier).
- Patched content flowed as `fileOverrides` into repo write, then:

## ⚠️ Operational lesson v2 must keep: patched CODE files need an explicit LIVE publish

From `edsHelpers.ts` (added by `cfbd05ba`): `previewCode` only syncs code to the **preview** domain
(`.aem.page`); patched code files had to be explicitly published to **live** (`.aem.live`) via
`getAppliedPatchPaths(patchResults)` → bulk publish. **Step 2 must verify the v2 patch-apply slot ends with the
patched paths published to live** (or confirm the current reset pipeline's code-sync/publish step already covers
the patched files) — otherwise patches appear on preview but not on the live demo, which is precisely the failure
`cfbd05ba` fixed in production.

## Sample payload (shape v2 externalizes to `eds-demo-patches`)

`config/patches/header-nav-tools-defensive.ts`:

```ts
export const searchPattern = `const navTools = nav.querySelector('.nav-tools');`;

export const replacement = `let navTools = nav.querySelector('.nav-tools');

  // Create nav-tools section if it doesn't exist in nav structure
  if (!navTools) {
    navTools = document.createElement('div');
    navTools.classList.add('nav-tools');
    nav.appendChild(navTools);
  }`;
```

In v2 this becomes one entry in `citisignal/code-patches.json` in the patches repo:
`{ "id": "header-nav-tools-defensive", "target": "blocks/header/header.js", "description": "…",
"precondition": "<searchPattern>", "replacement": "<replacement>", "exit": "PR to hlxsites → delete on merge" }`.

## v2 deltas (recovered + refactored, not reinvented)

| v1 | v2 (per ADR-006 + owner decisions) |
|---|---|
| `filePath` | `target` (same semantics; matches content-patch naming family) |
| Payloads bundled in extension (`config/patches/*.ts`) | **Externalized** to `eds-demo-patches` `citisignal/code-patches.json` (D3) — v1's one structural flaw |
| Fetch target file from template repo raw URL | Operate on the **cloned repo's files** in the create/reset pipeline (post-reset / post-block-install slots, Step 2) |
| Definitions ad-hoc fetched per file | Reuse `contentPatchRegistry`'s external fetch + promise-per-source cache + `TIMEOUTS.*` |
| Results logged only | Results logged **+ one-time toast** via shared `reportUnappliedPatches` helper (D1) |
| No exits | Each patch declares `exit`; drift-gate watches retirement (Step 7) |
| — | Optional per-patch `critical: true` → hard abort (defaults off) |

Keep from v1 verbatim: the two interfaces (modulo rename), multiple-patches-per-file composition via the
shared map, unknown-id warning, per-patch error isolation, and the live-publish-of-patched-paths lesson.
