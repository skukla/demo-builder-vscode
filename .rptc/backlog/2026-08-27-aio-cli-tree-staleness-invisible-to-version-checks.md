---
id: PL-6
kind: fix
area: platform
needs: []
value: med
status: backlog
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
