# Handoff: Thin-Layer Storefront Initiative (ADR-006)

**For the agent picking this up**: this file is a session handoff written 2026-06-10. All decisions below are made, owner-approved, and recorded — do not re-litigate them. Your job is the next workstream: the ADR-006 implementation plan. Delete this file once that plan exists in `.rptc/plans/`.

## Read these first, in order

1. `docs/architecture/adr/006-thin-layer-storefront-customization.md` — the accepted decision record (includes all amendments through commit `ff9ad01f`)
2. `.rptc/research/thin-layer-storefront-evaluation/findings.md` — the fork audit that backs the decision
3. `.rptc/research/thin-layer-storefront-evaluation/impact-analysis.md` — every extension touchpoint that must change, with a consolidated implementation checklist at the end

## Decisions already made (summary — the ADR is authoritative)

- **Retire `skukla/citisignal-eds-boilerplate` as a template fork** (archive it once nothing points at it). CitiSignal storefronts build from canonical `hlxsites/aem-boilerplate-commerce` instead.
- **Build from a last-known-good (LKG) canonical commit, never raw `main` and never a hand-maintained pin.** A daily GitHub Actions job in the external patches repo verifies our patches against canonical `main` and, on success, publishes the verified SHA to a `last-known-good` file (one writer; all extensions read it at create/reset). On failure it just logs — no notification integration, by owner preference. The same job detects patches made obsolete by upstream fixes and opens retirement PRs automatically.
- **Code patches v2**: reinstate the removed template-patch system (prior art recoverable at `f6a7d029^:src/features/eds/services/templatePatchRegistry.ts` and `f6a7d029^:src/features/eds/config/patches/`), with definitions **externalized** to the patches repo (today `skukla/eds-demo-content-patches`; may generalize). Patch ledger target: **~6–8 patches**, each with a declared exit; patch-minimization policy is in the ADR ("additive or upstream first").
- **Two upstreams, one policy**: the 9 demo-team blocks are sourced **live** from the demo team's boilerplate (`demo-system-stores/accs-citisignal` — demoted from "our template" to "block-source upstream"; it is NOT archived, it's the demo team's repo). Block discovery is dynamic with dedup-against-destination, so only net-new blocks install — zero installer changes needed, one config-line flip in `block-libraries.json`.
- **Modifications to library-sourced blocks ship as day-one code patches** (owner directive, commit `ff9ad01f`): never edit library blocks in place, never carry private copies. Upstream PRs are each patch's exit, not its gatekeeper — concretely, our fork's two product-teaser fixes become day-one patches with PRs filed to the demo team, so the block-source flip does NOT wait on their review.
- **BuildRight will be completely rebuilt** on this model — out of scope here, tracked in `.rptc/backlog/2026-06-10-buildright-eds-disposition.md`, gated on this implementation existing first.
- The `accs-citisignal` **DA.live content site** (`demo-system-stores/accs-citisignal` on content.da.live) is not the GitHub repo — content sources in config are unchanged.

## Your task

Propose the ADR-006 implementation plan structure (steps, order, risks) for owner approval — **do not write code yet**. RPTC research already exists (the three docs above), so go straight to planning. Key pieces the plan must cover, per the impact-analysis checklist:

1. The patches-repo drift-gate workflow: cron + check script + `last-known-good` file + obsolete-patch retirement PRs + PR-time validation.
2. The v2 code-patch registry in the extension (engine generic; definitions external; patches apply at create/reset after reset-to-template and after block install, so they can target both canonical files and installed library blocks).
3. Extracting and consolidating the actual patch set from the audit (aem-assets dropin patch instead of 14 import swaps; one vendored stylesheet link + additive brand CSS instead of 11 CSS edits; canonical-bug carries; the two product-teaser block carries).
4. LKG redirects: `executor.ts` `fetchTemplateCommitSha()` (record LKG at create) and `templateUpdateChecker.ts` (compare against LKG, not canonical `main`).
5. `templateSyncService.ts`: deprecate the `merge` strategy for thin-layer packages — updates go through reset.
6. `edsResetRepoHelper.ts` / reset pipeline: clone canonical at LKG SHA (verify the generate-from-template-pins-to-HEAD caveat in impact-analysis 1.5), add the patch-application step, placeholder fetch follows config.
7. Config flips: `demo-packages.json` (CitiSignal template fields → canonical, mirroring the existing `custom` package shape; new code-patch + LKG source fields) and `block-libraries.json` (`demo-team-blocks.source` → `demo-system-stores/accs-citisignal`).
8. Upstream PRs to file: account-sidebar selector race, `aem.js` origin fix, header nav-tools defensiveness, SKU slash encoding (→ `hlxsites/aem-boilerplate-commerce`); two product-teaser fixes (→ `demo-system-stores/accs-citisignal`).
9. Sequencing: nothing may still point at `skukla/citisignal-eds-boilerplate` on the day it's archived; the block-source flip (with teaser fixes as patches) lands first.
10. Optional cleanup while in the area: stale note at `aiContextWriter.ts:309` ("Library promotion is a planned future Demo Builder feature" — the `promote_block_to_library` MCP tool has since shipped).

AI tooling (MCP server, skills) needs **no changes** — verified in the impact analysis.
