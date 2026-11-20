---
id: PL-97
kind: chore
area: platform
needs: []
value: low
status: backlog
---

# Real store codes from local settings

Filed 2026-11-16, during the beta.153 name cleanup.

The test store's real website, store and store view codes contain the client's name, so the repo
can no longer hold them. The release-test plan (`.rptc/plans/beta-153-release-tests/overview.md`)
and one evaluation-battery prompt (`.rptc/plans/evaluation-mode/battery/prompts.json`) now say "the
test website", "the test store" and "the test store view" instead, and the real codes sit in a local
note outside the repo (`~/.demo-builder/real-store-codes.md`).

That note is a stopgap: a person reads it and types the codes in. The battery prompt in particular
now names no website an agent can act on.

## What done looks like

- The evaluation battery and the release-test rules read the real test store codes from a local,
  user-scoped setting (the repo's pattern for values that must not be committed), and substitute them
  where a run needs a real code.
- The repo never needs the client's name to run either.
- The local note is deleted once the setting carries the codes.
