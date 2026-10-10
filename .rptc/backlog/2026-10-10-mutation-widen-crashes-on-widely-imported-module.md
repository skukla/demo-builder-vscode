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

## Two more ways it fails (PL-70 batch MUT-03, 2026-10-10)

Both met on a three-module group that included
`src/features/dashboard/handlers/appManagementInstallHandlers.ts`, which widened by
72 importing suites.

**A suite that reads `src/` as text fails the dry run.**
`tests/features/ai/server/toolNarration.test.ts` finds directly registered tools by
running a regex over the source files (`^\s*server\.registerTool\(\s*\n?\s*'([a-z_]+)'`).
In Stryker's sandbox the suite reports `get_component_requirements` as a phrase for
a tool that does not exist. The likely cause is that the sandbox copy of a module
under measurement is instrumented, so the regex no longer matches it; that was read
off the failure and not tested. The command printed
`ERROR DryRunExecutor One or more tests failed in the initial test run` and exited 1.
The suite passes in an ordinary run. Removing that one line from
`jest.focus.config.js` by hand let the dry run pass.

**With the dry run passing, the same widen hit the 12-minute limit** (exit 124). The
83 suites included nine `tests/extension-*` suites and three `commandManager` ones.

The batch carried on by measuring each module alone on its own suites. For
`componentRequirementsTool.ts` alone the widen was 17 suites, finished in 1.4
minutes and settled 8 of 9 reported gaps without a test being written, so the
feature earns its keep on a module with few importers.

Added to the recommendation: when the dry run of a widened focus fails, name the
failing suite, drop it and try once more; and refuse or rank a widen that adds more
than a few dozen suites for one module.
