# Step 02 — Classify each unexposed handler: expose, or never, with a reason

**Kind:** judgment, recorded as data
**Depends on:** step 01
**Touches:** `src/features/ai/server/toolCoverage.ts`

## Goal

Replace every `'unreviewed — see plan step 02'` with a real disposition. The output is the
input to steps 03–04, and the permanent answer to "why can't the agent do X?".

## The worklist already exists

`.rptc/research/ai-surface-coverage/research.md` § Appendix lists all 41 handlers with no
descriptor row, grouped by a starting hypothesis. Work from it — but the grouping is a
hypothesis, not a disposition. Four in `dashboardHandlers` (`requestStatus`,
`addAppBuilderComponent`, `renameAppBuilderComponent`, `setProjectDestination`) and
`meshHandlers`' `ensure-mesh-api-subscribed` are unclassified; read those first, since they
are where an actual gap would be.

## Method — read, do not grep

Open each unexposed handler and answer, in order:

1. **Does it need a panel?** Does its RESULT depend on `sendMessage`, or does it only use
   the panel as a side channel for progress? `headlessHandlerContext.ts` supplies the
   headless context; a handler whose answer arrives via `sendMessage` does not qualify.
2. **Does the return value carry the OUTCOME, or only the DISPATCH?** This is a separate
   test from (1) and the one the first audit pass missed. A handler can be perfectly
   headless — no panel, no modal — and still be unexposable because it returns before the
   work finishes. `handleSyncStorefront`'s entire body is
   `await vscode.commands.executeCommand('demoBuilder.syncStorefront')` followed by
   `return { success: true }`; `handleRefreshBlockLibrary` documents the same contract
   ("the command was **dispatched**, not that the rebuild succeeded"). Exposing either
   hands an agent a tool that cannot fail — worse than no tool, because it reports success
   while the work may not have run. Disposition `never:fire-and-forget`.
3. **Does it prompt?** A modal or `vscode.window` input on the happy path disqualifies it.
   `showWarningMessage` as a side channel is tolerated.
4. **Would exposing it be a write hiding in a read?** Does it create-on-miss? That is not a
   read tool no matter what it is called.
5. **Is it already reachable another way?** Many unexposed handlers have an equivalent in a
   domain tool module (`republishContent` → `republish`, `deleteProject` → `delete_project`,
   `resetProject` → `reset_eds_project`). Disposition `never:covered-elsewhere`, naming the
   tool. Where the pair is deliberate, say why — `get_store_structure` versus the wizard's
   `discover-store-structure` is the model: same question, one panel-free and returning its
   result directly, one reporting through `sendMessage` for a form still being filled in.
6. **Should an agent have it at all?** Some capabilities are deliberately human-only.
   Say so rather than leaving the absence to be re-litigated.

The 2026-08-05 lesson applies directly: a name match is not verification. Three of six
duplication candidates that scored on names alone were wrong, and reading the files is what
separated them.

## Dispositions

Each handler gets exactly one:

| Disposition | Meaning | Feeds |
|---|---|---|
| `expose:read` | Headless-safe, no side effects, result carries the outcome | step 03 |
| `expose:action` | Same, but has side effects | step 04 |
| `never:panel` | Result depends on the webview channel | — |
| `never:fire-and-forget` | Returns on dispatch; success does not mean success | — |
| `never:covered-elsewhere` | A domain tool module already does the work — name it | — |
| `never:navigation` | Moves a human around the UI; `open_view` covers the general case | — |
| `never:interactive` | Requires a human decision mid-flight | — |
| `never:by-design` | Agent should not have this capability | — |
| `defer:<owner>` | Out of scope here (e.g. data-installer actions) | — |

Reasons are prose and load-bearing — they are what the next person reads instead of
re-deriving. `never:by-design` without a reason is not acceptable.

## Expected shape of the answer

Measured starting point (research Finding 1): of the 41 handlers with no descriptor row,
the ones read so far fall into UI navigation, fire-and-forget dispatchers, and capability
already reachable through a domain tool module. **Most of the gap is not a gap.**

`edsHandlers` is the interesting one: 15 handlers, 2 exposed. Storefront operations are
long-running and progress-reporting, so a large `never:panel` / `never:fire-and-forget`
count there would be unsurprising and is a legitimate result.

Do not force a target number of exposures. An audit that concludes "these 4 should be
exposed and these 37 correctly should not" is a successful audit — and on the evidence so
far, that is closer to the expected answer than a large sweep.

**Do not batch-classify.** The three categories above were separated by opening the files;
`handleSyncStorefront` looks like a substantial capability from its name and is two lines
that dispatch a command. A name match is not verification.

## RED

Extend `toolCoverage.test.ts`:

- **No handler carries the `unreviewed` placeholder.** This is the step's completion gate.
- **Every `expose:*` disposition names a real descriptor target** — the handler exists in
  the map it claims.
- **Every `never:*` and `defer:*` carries a reason of at least a full sentence.** A word
  is not a reason.

## Done when

- Zero unreviewed handlers.
- Each `expose:*` entry is ready to become a descriptor row.
- The counts land in `docs/systems/mcp-server.md` alongside step 01's table.
- `gate` green.

## Notes

Record surprises in this file as you go. If a handler looks exposable but its service
reaches a panel two calls down, that is exactly the finding worth writing — it is invisible
to everyone who comes after unless it is written here.
