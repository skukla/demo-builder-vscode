---
id: EDS-51
kind: fix
area: eds
needs: []
value: high
status: active
---

# Updates bring a storefront to the TESTED version, and keep Demo Builder's layer on it

Found 2026-10-16 while preparing the EDS-49 canary to test updates. Owner approved
the fix the same evening ("Yes"). ADR-006 says a thin-layer storefront is built from the
patches repo's last-known-good (LKG) commit, the one the daily gate verified against our
patches. Several paths do not honour that. Each was verified by reading the code; the
version-fetch one also by a live request.

1. **Check for Updates merges to Adobe's LATEST commit, not the LKG.** The checker
   compares against the LKG; the merge (`applyTemplateChangeSince`) replays the template's
   change up to `template/main`. So an applied update can bring in commits nothing has
   checked against our patches, and records that unverified commit as the project's
   version.
2. **Nothing restores our layer after an update.** A clean merge keeps the old patch edits,
   but a patch ADDED to the ledger since creation is never applied, and nothing checks the
   404 handling or Quick Edit.
3. **On a conflict, the only way out wipes the layer.** "Reset to template" (and the agent's
   `resetTemplateOnConflict`) replace the code with the template's and force-push. Nothing
   puts back the patches, the 404 handling or Quick Edit. The project's own Reset already
   rebuilds all of it at the LKG.
4. **The agent can force-push that reset with no consent dialog.** `apply_updates` is not in
   `AGENT_ALERT_COPY` and declares `destructiveHint: false`.
5. **Patched files are fetched from Adobe's latest commit, on create AND reset.**
   `applyCanonicalCodePatches` reads each patch target from the template's `main`; the rest
   of the tree is the LKG. A comment in `lkgPinHelper.ts` says a single file cannot be
   fetched by commit id. False: `raw.githubusercontent.com/<template>/<lkg-sha>/<path>`
   answered 200 on 2026-10-16, for an LKG commit already rewritten off `main`. Harmless
   while the two copies agree (they did: same hash); wrong the day Adobe changes a patched
   file, which is the case the LKG exists for.
6. **An agent-created storefront records no `lkgSource`.** `create_project` copies a few
   storefront fields by hand into the creation settings and misses `codePatches` /
   `codePatchSource`, so the project is recorded as a plain fork: its update check compares
   against Adobe's latest. The wizard uses `pickStorefrontDerived`. Seen on the recreated
   canary (`lkgSource: None`) beside a wizard-made project that has it.

## Plan

- Decompose `templateSyncService.ts` first (426 lines, four jobs), behaviour-preserving.
- Fix 6, then 5, then 1-3, then 4.
