# Step 6: Test Sweep + Runtime Verify

**Purpose:** Close the test-synchronization gaps surfaced by the URL/label changes, and confirm EW actually loads on the param-less URL for a real site.

**Prerequisites:** Steps 1–5.

---

## Tests to write/update (test-code synchronization — mandatory)

- [ ] **`aiContextWriter` test** — `tests/features/project-creation/services/aiContextWriter.test.ts`: the DA.live endpoint line now reflects the resolved experience. Add a case asserting an EW-configured project emits the `https://da.live/canvas#/<org>/<site>/` form (still passed through `sanitizeUrl`/`escapeMarkdown`). Confirm UE case unchanged.
- [ ] **Sanitization** — if any sanitization/snapshot test pins the old `https://da.live/#/...` string for EW, update it. (Locate via `grep -rln "da.live" tests/`.)
- [ ] **Confirm `getEdsDaLiveUrl` unit test exists** (created in Step 4) and covers both branches — this is the test that did not exist before this feature.
- [ ] **Confirm resolver test** (Step 3), **editor.path site-scope test** (Step 4 update), **flip-handler test** (Step 5), **Quick Edit + anchor-match tests** (Step 1), **config-template plugin test** (Step 2) all pass together.
- [ ] **Full suite gate:** `npx jest --no-coverage` (do NOT pipe through `tail` — see project memory; redirect to a file or run unpiped). Coverage 80%+ on the new/changed paths.

## Runtime verification (manual)

- [ ] Configure a real EDS project to EW (per-project flip or global setting).
- [ ] Click "Author" → confirm it opens `https://da.live/canvas#/<org>/<site>/` and the EW shell loads with **no "outdated" warning** (param-less = current alpha, per research browser-verification 2026-06-11).
- [ ] Confirm the EW **Layout (WYSIWYG)** view renders (not blank) — proving the Quick Edit vendoring (Step 1) + Sidekick plugin (Step 2) are wired.
- [ ] Flip the same project back to UE → confirm "Author" reverts to `https://da.live/#/<org>/<site>` and the Sidekick "Edit" punch-out still lands in `experience.adobe.com`.
- [ ] **Sibling-site isolation check (load-bearing):** with two projects sharing one DA org, flip one to EW and confirm the other project's `editor.path` (UE) is unchanged in its `/config/<org>/<site>` sheet — proves the site-scope change (Step 4) prevents cross-site clobbering.

## Acceptance Criteria

- All updated/new tests pass; full suite green; coverage target met.
- EW loads on the param-less URL with a working Layout view.
- UE behavior byte-identical to pre-feature.
- Two projects sharing a DA org flip independently (no cross-site editor.path clobber).

## Notes / Constraints

- This step writes NO production code — it is verification + test synchronization only.
- Migration confirmation: a pre-existing EDS project with no `authoringExperience` metadata resolves to UE and behaves exactly as before (no backfill).
