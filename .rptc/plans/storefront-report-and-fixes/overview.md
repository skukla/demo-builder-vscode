# Storefront Report: readable, and its fixes honest (EDS-64)

Written 2026-10-23 from the JustRite walk. Two read-only investigations (code, the
reset's Debug Logs, the patches repo, JustRite's live site and repository) plus a
design pass. Claims marked *inferred* were read from code, not run.

## What the owner saw

Opening the Storefront Report on JustRite: a raw markdown editor tab, then a modal
"Apply 2 of Demo Builder's fixes to this storefront? They fix: product links; AEM Assets
images." The reset an hour earlier had said nothing about fixes.

## What is actually wrong

**The offer is broken three ways.**

1. **The reset never offers fixes to a project made before 2026-10-03.** The fix pass
   (`demoFixPass.ts:80`) reads the storefront's template lineage only from the saved
   `demo` row (`lineage`, `boilerplate`), which projects older than `0ee47ed3b` do not
   have. JustRite (created 2026-09-30) has neither, so the pass took the "not our
   template" branch. The report reads lineage live from GitHub (`storefrontReport.ts:175`),
   matches `adobe-commerce/boilerplate-b2b-template`, and offers. The two disagree.
2. **Apply would have written nothing, and said the wrong reason.** The report's Apply
   calls the same pass (`storefrontReportDeps.ts:51`), hits the same missing record, and
   answers "none of the fixes fit this code any more" (`src/commands/storefrontReport.ts:137`).
   *Inferred*; not run. The agent's `reset_project applyFixes:true` has the same gap.
3. **Had it written, the product-links fix would have broken the block.** The offered list
   (`STOREFRONT_FIX_IDS`, `loadBearingPatches.ts:74`) has `product-teaser-sku-encoding`,
   which calls `getProductLink`, but not its pair `product-teaser-getproductlink-import`.
   JustRite's `blocks/product-teaser/product-teaser.js` imports only `rootLink`
   (verified), so the block would throw.

Smaller, same area:

4. The dry check skips everything under `blocks/` (`codePatchPipelineHelpers.ts:80`), so the
   product-links fix can never be checked on a colleague's storefront.
5. The patch engine reads "before" ahead of "after" (`codePatchRegistry.ts:237`): a fix whose
   new text contains the old (`pdp-empty-data-redirect`) reports "would apply" on code that
   already has it, and a real write would add it twice (*inferred*). `storefrontFixes.ts:177`
   already does this the right way.

**The reset hides some of its own warnings.**

6. `catalogMenu` and `productPages` never reach the reset's modal or notifications
   (`edsResetNotifications.ts:32-58`). JustRite's "13 category pages couldn't be published;
   republish the storefront to try again" was in the log and nowhere on screen. The modal has
   a `note` slot for plain notes (`withOperationProgress.ts:92`) that reset never fills.
7. When the mesh redeploy fails, `edsResetFinalize.ts:94` returns early and drops the fix
   lines and a config-write failure.
8. The agent's reset result drops `error` on success (`edsResetTool.ts:163-185`), so an agent
   never hears of a failed config write or mesh redeploy.

## What the fixes are (all four repair Demo Builder features; none changes a design)

| Fix | File | Without it | On JustRite |
|---|---|---|---|
| Product links (+ its import, missing today) | `blocks/product-teaser/product-teaser.js` | The teaser's Details link keeps the SKU's capitals and misses the page | No published page uses the block: nothing visible |
| AEM Assets images | `scripts/__dropins__/tools/lib/aem/assets.js` | No image for a SKU containing "/" | None of 49 SKUs has one: nothing visible |
| Empty product pages | `scripts/initializers/pdp.js` | Blank page for a SKU that is gone | Already present |
| Header robustness | `blocks/header/header.js` | Header crashes when DA.live drops an empty div | Already present |

Only JustRite is an added demo on this machine; the added-demos setting is empty and the
catalog lists shipped brands only.

## The report, redesigned

A modal over the project dashboard (no new webview bundle), fed by a new returning handler
`getStorefrontReport`. Nothing changes unless a button inside it is pressed.

```
Storefront report: JustRite                                    [Close]
NEEDS YOUR ATTENTION
 (!) Needs reset            This storefront is behind ...        [Reset…]
 (i) 2 Demo Builder fixes fit this code   They fix: ...       [Apply fixes]
 (i) The template has 4 newer commits     ... Your commits stay [Bring up to date]
 (i) 2 links go to pages that don't exist
     /checkout/cart on /footer (Edit in DA.live)
     /fr on /store-switcher (Edit in DA.live)
ABOUT THIS STOREFRONT
 Comes from   Khalil's kmanns/justrite, made from Adobe's B2B template
 Built on     Boilerplate <version> (Demo Builder's current is <version>)
 Fixes        On the code: empty product pages, header robustness
 > Details    (Adobe commit, files Demo Builder wrote)
```

- Both VS Code modals go; the button is the consent. Long actions run in the existing
  `OperationProgressModal`.
- The command palette and the reset's "See the storefront report" open the dashboard with
  the report open. The markdown tab goes; `storefrontReportLines` stays for Diagnostics and
  the agent.
- Agent parity: `get_storefront_report` gains the template catch-up; a new confirm-gated
  `apply_storefront_fixes` closes the gap (applying fixes today needs a whole reset).
- Medium size. Riskiest part: opening the modal from the command palette, and the report
  type reaching the webview without breaking ADR-017's import rules.

## Decisions for the owner

1. **Apply the fixes automatically on reset and creation for a colleague's demo built on
   our templates?** Recommended: yes. All four repair Demo Builder features and none
   changes a colleague's design; the result says what was applied. Opt-in (decided
   2026-10-03) would then only matter for a fix that changes a design, of which there are
   none today. If declined, the redesigned report keeps the Apply button.
2. **The report as a modal over the dashboard** (recommended) or its own panel (a ninth
   webview bundle).
3. **"Bring up to date" (merge the template into a fork) cannot be undone** by Demo Builder.
   Keep it with that said on the button, or drop it from the report (Check for Updates
   already offers fork sync).

## Decided a third time (owner, 2026-10-23, evening): this replaces "Decided again"

"Any patch we have that we know should be and can be applied SHOULD be applied to any
storefront used by the builder." So no SECOND list, and no offer: creation and reset apply
every live patch in the shipped ledgers to every storefront, wherever the code it fixes is
there exactly once, the patches on one file together or none (`knownPatches.ts`, a repair in
`storefrontUpToDate.ts`'s build step). Dry run on JustRite's real files: 2 of 6 already in, the
other 4 fit.

## Decided again (owner, 2026-10-23, later the same day)

Maintaining a list of fixes for code Demo Builder did not write is not worth its cost. An
added demo's code is copied as it is: no fix applied, offered or dry-checked. The report keeps
"Needs reset", broken links and where the storefront comes from; no fixes section. The shipped
brands' patches are untouched. This replaces decision 1 below; 2 and 3 stand.

## Decided (owner, 2026-10-23), decision 1 superseded above

1. Fixes are applied automatically on reset and creation for a colleague's demo built on our
   templates, once the fix list is correct (paired fixes, block files checked, never applied
   twice), and the result says what was applied. The "Apply fixes" button goes, and with it
   `reset_project`'s `applyFixes`.
2. The report opens as a window over the project dashboard, as the mockup.
3. "Bring up to date" (the fork merge) leaves the report; Check for Updates keeps it.

## Order of work

1. Bugs 1, 3, 6, 7, 8 first (they are wrong whatever is decided), then 4 and 5.
2. Decision 1, then the report redesign.
