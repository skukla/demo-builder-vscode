---
id: AI-1r
kind: question
area: ai
parent: AI-1
needs: []
value: med
status: open
layer: B
---

# 34% of the surface is "agent-relevant and uncovered" — is any of it real?

Filed 2026-08-29, from the first `npm run sweep`.

`ai-coverage-scan` reports:

```
UI-reachable handler types : 127
reachable by an MCP tool   : 61
uncovered                  : 66  (23 UI-only, 43 agent-relevant)
AGENT-RELEVANT GAP         : 43  (34% of the surface)
control: 127 map keys read from handler-keys.mjs, 169 agent tool names found
```

**The number is a LEAD, and it is already known to be too high.** Two of the 43
were spot-checked at filing time and neither is a gap:

| Handler type | Counted as uncovered | Reality |
|---|---|---|
| `getProjects` (projectsListHandlers) | yes | `list_projects` exists |
| `republishContent` (dashboardHandlers) | yes | `republish` exists |

The scan matches handler-type strings against tool names. Where a tool does the
same job under a different name, it counts a gap that is not there. So 43 is an
upper bound on the real number, not a measurement of it — which is exactly why
this is a question rather than a feature. There may be nothing to build.

Reading the list, the 43 look like three different things:

- **Webview plumbing that no agent should ever call** — `log`, `ready`,
  `requestStatus`, `re-detect-context`, `storefront-setup-start` /
  `-cancel`. These are the message channel talking to itself.
- **Wizard-internal state machine** — `loadComponents`, `loadDependencies`,
  `get-components-data`, `update-components-data`,
  `update-component-selection`, `validateSelection`, `validate`,
  `checkCompatibility`. An agent configures a project through
  `configure_project`, not by driving the wizard's steps one message at a time.
- **Genuine candidates** — `resetProject`, `exportProject`, `importFromFile`,
  `switchOrg`, `deleteEventEntity` / `getEventEntities`,
  `provision-accs-credentials`, `ensure-mesh-api-subscribed`. These are real
  user actions with no obvious agent route.

That last group is the item. The first two groups, if the reading holds, are the
scan over-reporting.

## What would answer it

1. **Triage all 43 into the three groups above**, by reading the handler — not by
   reading its name. A name match is what produced the two false gaps already.
2. **For each genuine candidate, decide** whether an agent needs it, using the
   bar `AI-1l` sets: does a tool make the agent faster, or just move where it
   gets stuck? A tool nobody's prompt asks for is not obviously worth adding —
   that is `tool-verdicts`' whole finding.
3. **Fix the scan's false positives.** Whether that is an alias map
   (handler-type → equivalent tool name) or an exclusion list for plumbing is a
   design call; today the scan cannot tell "no tool exists" from "the tool is
   called something else", and it reports both as a gap. Until it can, the
   headline percentage should not be quoted anywhere as a measurement.

Adding tools is NOT the assumed outcome. The honest end state may be "6 of the 43
are real, we want 2 of them, and the scan should stop counting the other 37".

## Why this is not AI-1b

`AI-1b` asks the inverse question — 104 tools exist and agents reach 20 of them,
so what is wrong with the ones we HAVE. This asks what is missing. Both feed
`AI-1`; neither answers the other. A tool can be both present and unused
(`AI-1b`) while a job has no tool at all (here).

## The full list, as measured 2026-08-29

```
by area:
  14  ProjectCreationHandlerRegistry.ts     9  edsHandlers.ts
   9  dashboardHandlers.ts                  5  addIntegrationFlowHandlers.ts
   2  projectsListHandlers.ts               1  configureHandlers.ts
   1  prerequisitesHandlers.ts              1  meshHandlers.ts
   1  importHandlers.ts

authenticate · check-auth · check-credential-service · check-dalive-auth ·
check-github-auth · check-project-apis · checkCompatibility · clear-dalive-auth ·
configure · continue-prerequisites · deleteEventEntity ·
ensure-mesh-api-subscribed · ensure-org-selected · exportProject ·
get-components-data · get-github-repos · get-projects · get-workspaces ·
getEventEntities · getProjects · github-change-account · github-oauth ·
importFromFile · list-org-console-apis · loadComponents · loadDependencies ·
loadPreset · log · provision-accs-credentials · re-detect-context ·
reAuthenticate · ready · republishContent · requestStatus · resetProject ·
store-dalive-token-with-org · storefront-setup-cancel · storefront-setup-start ·
switchOrg · update-component-selection · update-components-data · validate ·
validateSelection
```

Reproduce with `bash .claude/skills/ai-coverage-scan/scan.sh --list`, or see the
scan in context via `npm run sweep`.

## Shipped so far

- 2026-08-29  docs(backlog): AI-1r — is the 34% agent-surface gap real? (`c55a8d44b`)
