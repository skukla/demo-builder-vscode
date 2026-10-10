---
id: PL-71
kind: fix
area: platform
needs: []
value: low
status: backlog
---

# Widening a mutation measurement crashes when the module is imported everywhere

Filed 2026-10-10, found while working PL-70 batch MUT-02.

`npm run test:mutation:measure -- --widen` adds the importing suites for every
module the first run left uncovered. For a group that included
`src/core/utils/githubUrlParser.ts` it added **384** suites for that one file (a
core utility reached through long import chains), plus 13 for
`appBuilderDeployOutcome.ts`.

One of the 384 is a React suite (`tests/core/ui/components/forms/GitHubLinkField.test.tsx`),
so `focusModule.mjs` wrote the focus config with the browser test environment for
every suite ("jsdom for BOTH sets"). Node-only suites then crashed Stryker's dry
run:

```
src/features/app-builder/services/apiSubscriber.ts:100
    const stillWaiting = new Promise((resolve)=>setImmediate(()=>resolve(false)));
[ReferenceError: setImmediate is not defined]
```

The command printed `FAILED after 0.3 min` and exited 1, and removed
`reports/mutation/focus.json` on the way out. The batch carried on by measuring
each module alone and writing direct tests for the uncovered functions, which was
the right outcome for those four functions anyway.

The cause was read off the output (the config comment and the crash line), not
tested further. Nothing about it was in `.rptc/research/`, `docs/`, BURNDOWN.md or
the config comments.

## Recommendation

Refuse a widen that adds more than some number of suites for one module, or that
would mix test environments, and say which module caused it. A utility with
hundreds of importers is the cross-cutting case BURNDOWN.md already says to
reject by hand; the tool could reject it too. The mixed-environment crash may
also affect a small widen that happens to include one React suite and one
Node-only suite using `setImmediate`, which is worth checking when this is picked
up.
