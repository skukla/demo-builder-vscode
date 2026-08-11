# Eleven superseded message handlers, still registered

**Filed:** 2026-08-05
**Origin:** First run of `dead-code-scan`'s new closed-reference-loop procedure, added
after four such loops shipped undetected the same day.
**Severity:** Low — none of it executes. It is weight and misdirection, not a defect.
**Present in:** `lifecycleHandlers.ts`, `edsHandlers.ts`, `configureHandlers.ts`,
`aiHandlers.ts`, plus `ProjectCreationHandlerRegistry.ts` and `types/messages.ts`.

## ✅ SHIPPED 2026-08-05

All eleven removed. Every key re-verified against the four origins first.

**`inspect-mcp` was the caveat, and it resolved as dead — with a twist.**
`ai/README.md` stated the AI surface's "Refresh" action calls it. There is no
Refresh action in `AiOverviewScreen`; the whole aiSurface tree sends only `cancel`,
`copyAiPrompt`, `openInClaude` and `delete-ai-prompt`. The doc was asserting a
caller that does not exist — exactly why the item said to check this one by hand
rather than by grep. Both that line and `features/CLAUDE.md`'s "8 handlers" are
corrected.

**Cascade, as predicted.** `edsDaLiveOrgHandlers.ts` lost every export and went
with its test file, taking an empty `export {} from` block in `edsDaLiveHandlers.ts`
with it. Orphaned behind the handlers: `inspectAllServers`/`TIMEOUTS`/
`validateProjectPath`/`VerifyGitHubRepoPayload`/`ValidateAccsCredentialsPayload`
imports, plus `securityValidation`, `mockVSCode` and a `vscode` import left unused
in the lifecycle tests. Net −1500 lines across 23 files.

**Cascade that did NOT happen, checked rather than assumed:** `mcpInspector`
survives. `clearMcpCache` still serves `aiHandlers` and `inspectAllServers` backs
`aiSetupVerifier`, which powers the live `verify-ai-setup`.

Five handler-map COUNT assertions moved rather than being deleted (eds 20→15,
lifecycle 10→6, configure 6→5, ai 8→7, openAi streaming 4→3), each with the reason
inline so the number is not later mistaken for drift.

## The finding

Eleven message types are registered in handler maps that nothing sends. Verified
against all four origins in the skill's procedure — no `ui/` sender, no MCP
descriptor (`features/ai/server/*Descriptors.ts`), no `package.json` command, and
nothing but registration plumbing plus their own docblocks.

Most are not merely unreachable but **superseded** — an older generation of message
names left registered when the newer one landed:

| Message | Handler | Superseded by |
|---|---|---|
| `verify-github-repo` | `handleVerifyGitHubRepo` | client-side check (`RepoSelectionInline.tsx:353` — `repos.some(...)`) |
| `open-adobe-console` | `handleOpenAdobeConsole` | `openDevConsole` |
| `cancel-auth-polling` | `handleCancelAuthPolling` | `cancel` / `cancel-project-creation` |
| `cancel-mesh-creation` | `handleCancelMeshCreation` | `cancel` / `cancel-project-creation` |
| `get-dalive-sites` | `handleGetDaLiveSites` | the `check-dalive-auth` / `open-dalive-login` generation |
| `list-dalive-orgs` | `handleListDaLiveOrgs` | same |
| `verify-dalive-org` | `handleVerifyDaLiveOrg` | same |
| `browseFiles` | `handleBrowseFiles` | no replacement found — simply unreachable |
| `create-workspace-credential` | `handleCreateWorkspaceCredential` | no replacement found |
| `validate-accs-credentials` | `handleValidateAccsCredentials` | no replacement found |
| `inspect-mcp` | `handleInspectMcp` | no replacement found — **see caveat** |

`get-dalive-sites` is also an OUTBOUND `sendMessage` name (`edsDaLiveOrgHandlers.ts`
:195, :200, :237): the handler pushes results back under the same key. Nothing sends
it and nothing listens for it — a dead pair keeping itself alive, the same shape as
`api-mesh-progress`.

## Execution plan

1. **Re-verify each key** with the four-origin check before deleting. This list is
   evidence, not a warrant — it was produced in one pass and the codebase moves.
2. Delete per key: the handler function, its handler-map row, its
   `ProjectCreationHandlerRegistry` row, its `types/messages.ts` union member, its
   `webviewCommunicationManager` timeout row if present, and tests that only covered
   it.
3. **Follow the cascade.** Each handler may be the only caller of helpers, and a
   collection whose last member goes may itself die — the 2026-08-05 `create-api-mesh`
   removal took 3 source files, 4 test files and 6 registration sites, none named in
   the item that scoped it.
4. Re-run `dead-code-scan` afterwards; ts-prune should surface newly-orphaned exports
   the first pass could not see.

## Constraints

- **`inspect-mcp` needs a human check, not a grep.** `features/CLAUDE.md` documents it
  as one of the AI surface's eight live handlers and `openAi.test.ts` mocks it. Neither
  is an origin, but a *documented* handler reading as dead deserves confirmation against
  the AI webview by hand before deletion.
- **No soft deprecation**: delete outright, no `(Deprecated)` stub.
- A test that exists only to cover a deleted handler goes with it. A test asserting a
  handler-map COUNT needs its number moved, not its assertion removed.
- Sync the docs that use any of these as a live example — that is how deleted things
  come back (`src/core/CLAUDE.md` and `core/communication/README.md` both did exactly
  this for `create-api-mesh`).

## Method note (do not re-derive)

The first automated attempt at this reported all eleven **and** `check-api-mesh` /
`deploy-api-mesh`, which are live — sent from `features/ai/server/` descriptors, not
from `ui/`. What separated signal from noise was a CONTROL: running the same check
against messages known to be sent (`listConsoleApis`, `addAppBuilderComponent`,
`reAuthenticate`) and confirming it found their senders. Do the control first.

## Kickoff prompt

> Eleven message types are registered in handler maps that nothing sends — verified
> against all four origins (no ui/ sender, no MCP descriptor, no package.json command,
> only plumbing and docblocks), and most are superseded by a newer message name. Re-verify
> each with the four-origin check, then delete the handler, its registrations, its union
> member and its tests, following the cascade into orphaned helpers. Treat `inspect-mcp`
> as needing a hand check first — it is documented as live. See
> `.rptc/backlog/2026-08-05-eleven-superseded-message-handlers.md`.
