# Step 2: Register the `quick-edit` Sidekick Plugin Entry

**Purpose:** Add the Quick Edit Sidekick plugin so the EW Layout (WYSIWYG) view can invoke it. This is the Config-Service half of the Quick Edit wiring (the GitHub-files half is Step 1). Brand-agnostic; applies to all EDS projects at create and reset.

**Prerequisites:** Step 1 (cohesive with it — may be folded into the same PR).

**Anchor:** `src/features/eds/config/config-template.json` → `sidekick.plugins[]` (currently `cif` + `personalisation`, `:26-43`). This template feeds `ConfigurationService.registerSite` via `buildSiteConfigParams` / `configGenerator.ts` (`configGenerator.ts:22` imports the template). Reset re-applies it through `updateSiteConfig` (`edsResetService.ts:144`).

---

## Tests to write FIRST (RED)

**Update:** `tests/features/eds/services/configGenerator.test.ts` (or the nearest existing config-template/registerSite test — locate via `grep -rln "config-template\|sidekick\|plugins" tests/`).

- [ ] Generated config (from `config-template.json`) includes a Sidekick plugin with `id: 'quick-edit'`, `title` set, `environments: ['dev','preview']`, `event: 'quick-edit'`.
- [ ] The `cif` and `personalisation` plugins are preserved (regression guard — new entry is additive).
- [ ] If a registerSite/site-params test exists, assert the `quick-edit` plugin survives into `buildSiteConfigParams` → `registerSite` body.

## Implementation (GREEN)

- [ ] Add to `config-template.json` `sidekick.plugins[]`:
  ```json
  { "id": "quick-edit", "title": "Quick Edit", "environments": ["dev", "preview"], "event": "quick-edit" }
  ```
  (Exact shape per research "Code-patch engine mechanics": `{id,title,environments:["dev","preview"],event:"quick-edit"}`. No `url`/`isPalette` — it's an event plugin, not a palette.)

## Files

- **Modify:** `src/features/eds/config/config-template.json`
- **Update test:** the config-template / registerSite test (locate exact file in RED phase)

## Acceptance Criteria

- `quick-edit` plugin present in generated site config at create AND reset (reset path already re-applies the template via `updateSiteConfig`).
- Existing plugins unaffected.

## Notes / Constraints

- KISS: static template entry — no per-project templating, no new code path. Reset coverage is free (template is the single source).
- This entry is inert under UE and active under EW; consistent with "apply Quick Edit to all EDS projects."
