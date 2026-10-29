---
id: AB-50
kind: chore
area: app-builder
needs: []
value: low
status: backlog
---

# Push the stranded docs commits; delete the two remote branches already on main

Filed 2026-09-30 from the review of the other agent's work. Owner's terminal, not the
agent's: the agent is blocked from `git push` (the push hook rule + the permission
classifier), so every step here is a command for a person.

## What the review found

- demo-builder-vscode `feature/erp-integration`: the 4 newest commits (docs, `9030d69dc..20566f855`)
  are not on origin.
- demo-erp: `origin/loop/erp-local-date` (7e119fe, 8a96803) is the pre-rebase copy of
  commits already on main under other hashes.
- commerce-erp-integration: `origin/loop/2026-09-29-ab-26e-sync-validation` differs from
  main only by rebase hashes; `loop/data-map-mockup` (5 HTML-mockup commits) is unmerged
  and was superseded by the Admin page redesign — decide keep or delete.

## The commands

```
cd demo-builder-vscode && git push origin feature/erp-integration
cd demo-erp && git push origin --delete loop/erp-local-date
cd commerce-erp-integration && git push origin --delete loop/2026-09-29-ab-26e-sync-validation
```

Plus this session's own branches when the deploy is done: demo-erp `loop/2026-09-30-erp-programme`
and `main`, demo-builder-vscode `loop/2026-09-30-erp-programme`, the integration's
`feature/live-checks-at-checkout`.

## Verification

`git log origin/<branch>` matches local; the deleted branches no longer list under
`git branch -r`. Nothing else changes.
