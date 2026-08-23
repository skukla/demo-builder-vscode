# Handoff — field bug sweep (beta.134 + beta.135 shipped)

**Branch:** `develop`, clean. Two releases published the same night.
**State:** full suite 14,687 / 1,110 suites green · tsc, typecheck:tests, eslint clean
· `rptc-hygiene-scan` clean (§3's `data-installer` plan is the one known, pre-existing hit)

Everything the work itself needed is already recorded — commits carry the reasoning,
`.rptc/complete/aem-assets-orphaned-setting/` has the six-month setting failure, and
four backlog entries were filed or corrected. **This file carries only what exists
nowhere else.**

## Open threads — nothing else records these

### 1. PHASE 5d has never run with a datapack actually landing first

The creation-time pre-warm phase (`catalogPrewarmPhase.ts`, called from
`executor.ts` after `executeSampleDataPhase`) is verified LIVE for the half that
matters most — it no longer pre-warms another project's catalog, proven by a
before/after on the same storefront: 39 CitiSignal SKUs on the old build, its own
30 on the fixed one.

**But both verification runs used pre-existing catalogs.** No run has imported a
datapack and then pre-warmed it. The ordering is proven by POSITION in the log
(after `Storefront Setup Complete`, before `WORKFLOW COMPLETE`), not by a seeded
import actually being enumerated.

One create with a datapack selected closes this. Watch for
`[Catalog Prewarm] N/N SKUs pre-published` after `Installing Sample Data`.

### 2. The field SC is not unblocked by the release alone

`.135` fixes the code. She still needs, in order:

1. Take the update (or install the VSIX).
2. Set `demoBuilder.daLive.aemAuthorUrl` — **bare host**, no `https://` prefix.
   The shared demo AEM; the value is in the author's VS Code settings.
3. Set `demoBuilder.dataInstaller.apiBaseUrl` to the team deployment.
4. Reset `field-bodea` — that rewrites the AEM Assets binding and re-runs pre-warm.

Without 2 and 3 she sees the same two failures on `.135` that she saw on `.133`.

### 3. Her OLDER site's 403 was never explained

```
[Helix] Admin API Key creation failed: 403     (fieldorg/field-b2b-demo, 11:33:59)
[PublishKey] No publish key registered — products added after setup will 404 on first visit
```

This is her **older** project, not the bodea site, and it was misattributed to the
bodea run twice during triage before the site name was checked. Her bodea site
minted and registered a key fine six minutes later, so it is specific to
`field-b2b-demo` — plausibly a site created before admin pinning existed. Not filed
as a backlog item because it has one data point and no reproduction.

## What was learned that the entries do not say

**Three "nearest to actionable" backlog items were already shipped**, found by
reading code rather than entries: catalog prewarm (`.130`), `delete_mesh` (`.132`),
and item 1 of the refused-credential entry (premise named the wrong function
entirely). `rptc-hygiene-scan` §5 and §6 were built during this session to catch
the first two shapes automatically. **§6 would NOT have caught the third** — that
item cited a function never involved in the failure it described, so no code
"moved". Reading remains necessary before picking work off section A.

## Deliberately not done, with reasons

- **`executeEdsPipeline` complexity 27** — filed as
  `2026-08-19-eds-pipeline-orchestrator-complexity.md`. NOT a decomposition; the
  skill's coupling test rejects the file and splitting it would leave all 27
  branches in place.
- **Making a failed CDN unpublish fatal** — surfaced, not escalated. Fatality is a
  product decision (item 2 of the refused-credential entry).
- **The pre-flight DA.live probe** — item 3 of that entry. Still correct, still
  unbuilt; `ensureDaLiveAuth` remains local-expiry only, and
  `adobeAuthGuard.ts:80` has the same shape.
