---
id: PL-6
kind: fix
area: platform
needs: []
value: med
status: active
---

# aio CLI tree staleness is invisible to version checks

## Index hook

*Found 2026-08-27, the hard way: it produced a WRONG "Adobe's problem" verdict
that survived a clean-room control.*

The starter kit failed `aio app build` with webpack CodeGenerationErrors on a
machine whose aio-cli was 11.1.2 — npm's latest, so every version check
passed. The actual cause: the CLI's dependency tree is LOCKED at install time,
and this install carried webpack 5.107.2; a fresh `npm install -g
@adobe/aio-cli` (same version!) pulls 5.110.0, which fixes the bug. Version
equality was the wrong test, and the extension's aio prerequisite — which
checks `aio --version` — can never see this class of staleness.

## Why it matters

Any semver-range transitive dep in the CLI means two machines "on the latest
aio" can behave differently by install date. Today it broke extension-app
builds; the failure signature ("Self-reference dependency has unused export
name") is now known, but the CLASS is general.

## Remedy candidates (decide at pickup)

1. **Cheapest**: when an integration deploy fails with a webpack
   CodeGenerationError signature, the surfaced error appends "try reinstalling
   the Adobe CLI: npm install -g @adobe/aio-cli" — a remedy hint at the point
   of failure.
2. The aio prerequisite gains a freshness dimension (install date or a probe
   of a known-sensitive transitive version) with a "Refresh CLI" action.
3. Do nothing beyond documentation — accept that reinstall is the standing
   fix, recorded here.

Leaning 1: targeted, no new maintenance surface, lands where the user is.

## Shipped so far

- 2026-08-27  Remedy SHIPPED (the bridge, owner-directed 2026-08-27 evening): consent-gated refresh-and-retry inside the deploy seam. A build failure matching the staleness signature asks once — notification prompt on wizard/dashboard paths, the refreshCli flag on the agent path (context.panel is the discriminator; a handler never parks an agent on a dialog) — then refreshes the global CLI and retries ONCE inside the same operation, so the user's first try still succeeds on machines that needed healing. LIVE EVIDENCE: detection + headless remedy-hint proven by re-planting webpack 5.107.2 into the CLI tree and calling deploy_integration (failed with the real error + the hint); refresh effectiveness proven twice (morning natural aging, evening against the plant — plain npm install -g restores 5.110.0 both times); the consent-yes orchestration pinned by 7 unit tests (a live one-run replay is confounded by aio reusing surviving build artifacts, which also means a retry can succeed for reuse reasons — fine, success is success). The extension-owned pinned CLI remains the durable answer on PR-1; this bridge is deliberately cheap enough to delete when it lands.
- 2026-08-27  fix(app-builder): the refresh prompt declines with "Not Now" (`f0e248185`)
- 2026-08-27  fix(app-builder): shorten the CLI-refresh prompt (`91ad66ba7`)
- 2026-08-27  feat(app-builder): consent-gated CLI refresh-and-retry — the PL-6 bridge, live-proven (`c032008ee`)
