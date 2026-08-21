# The other webview message channels are still untyped

**Filed:** 2026-08-21
**Origin:** The webview payload typing pass
(`../complete/2026-08-20-webview-payloads-are-typed-then-cast-away.md`). That
work closed the `init` channel — one channel of roughly thirty.

## The claim

Every extension↔webview message EXCEPT `init` still crosses the boundary
untyped: the sender builds an object literal, the receiver casts `data as
<whatever it hopes arrived>`, and nothing compares the two. This is the exact
disease the init work cured, on every other door. Since `9144bee9` widened
`WebviewCommunicationManager.sendMessage`/`request` to `payload?: unknown`,
there is not even the (fake) `MessagePayload` constraint left — the honest
signature, but it means NOTHING forces sender and receiver to agree.

## Measured 2026-08-21

Literal-string inventory (undercounts — types passed via variables or
`getRegisteredTypes` loops don't grep):

```bash
grep -rhoE "sendMessage\('([^']+)'" src --include='*.ts' | sort -u | wc -l   # ~40 push types
grep -rhoE "onMessage\('([^']+)'" src --include='*.ts*' | sort -u | wc -l    # ~30 subscriptions
```

Push channels include `statusUpdate`, `meshStatusUpdate`,
`appBuilderComponentsSnapshot`, `projectDestinationUpdate`, `configChanged`,
`projectsUpdated`, `demoStateChanged`, `creationProgress`, the prerequisite
and github/dalive auth families, and every request/response pair behind the
handler maps.

## Why filed rather than done

The init refactor took a scoped session and surfaced seven divergences beyond
the ten predicted; thirty channels done speculatively is weeks of work with no
attached bug. The record says this class bites for real (`brandName`,
`componentSecretFlags`, `stackBackend` ×4), so the play is: **type a channel
when it next causes a bug — one channel per slice, using the worked
examples** — not a big-bang pass.

## Worked examples (the pattern is proven twice)

1. **Init payloads** — `src/types/webviewPayloads.ts`: one interface per
   channel, producer return-typed against it, consumer props derived from it
   (`Partial<>` where tests render bare). See any of the commits
   `58763ed2`…`84397e2f`.
2. **`statusUpdate`'s `StatusPayload`** (`95bdf0b0`) — the original brand
   crossing; the payload type lives where both bundles can import it.

## Rules for each slice (inherited from the init pass — they all earned their place)

- Shared types must not import `vscode` (they compile into browser bundles).
- The payload type states the WIRE truth (`null` stays `null`; required means
  the sender always includes it); the receiver converts at its edge.
- Per-field disagreements: the DATA decides (config JSON, a logged payload,
  the serializer that builds it) — cite it in the commit.
- Expect the shared declaration to surface bugs; fix each in its own commit,
  regression test first, before the typing commit.
- A field named in an interface but absent from the sender is a LEAD — check
  `git log -S` for a deleted producer before resurrecting or deleting
  (precedent: `initialMeshStatus`, deleted; `packageName`, resurrected).

## Known cast clusters that belong to this work (from the 2026-08-21 boundary-cast triage)

Five argument-position `as never` casts were fixed the day this was filed
(data-installer request/auth/configs, updateCore saveProject). Two clusters
remain, both deferred INTO this item because each needs the surrounding
contract typed, not a cast deleted:

- **`AddIntegrationFlowAdapter.tsx` ×4** (`state as never`,
  `meshComponent as never`, `builder as never`, `buildReservedIds({...} as
  never)`) — the integrations surface reusing the wizard's add-integration
  modal by synthesizing partial wizard state. The honest fix is narrowing the
  MODAL's prop contract to what it actually reads per mode (the borrowed-
  component problem `webview-command-handler` describes), which is wizard-side
  typing work.
- **`stackComponentCollector.ts:76`** (`componentsData as never` + `as T` on
  the result) — launders the wizard's untyped `get-components-data` response.
  Dies naturally when that channel gets typed.
- **`executor.ts:378`** (`config as unknown as ProjectCreationConfig`) — the
  `create-project` REQUEST channel's landing point; and
  **`createProjectTool.ts:182/295`** (`{...} as unknown as WizardState` into
  `buildProjectConfig`) — the MCP tool synthesizing wizard state headlessly.
  Both die when the create-project request payload gets one declaration.

Related kill from the same triage: the Configure surface's own
`get-components-data` handler was a dead SECOND implementation with a
different response shape (raw components.json, no `{success,data}` wrapper);
nothing on that webview ever sent the message. Deleted 2026-08-21 — the
wizard's `componentHandlers.handleGetComponentsData` is the one handler,
which is also what makes typing this channel a single-declaration job.

## Phase 0 inventory — 2026-08-21 (the audit is now OPEN, user-initiated)

The wait-for-a-bug gate was lifted by the user; the campaign proceeds
inventory-first, one channel per slice. First measured pass (literal-string
scan of `sendMessage('X'` vs `onMessage('X'`), with its blind spots named:
`postMessage({type: 'X'})`-style sends and ~15 dynamic send sites are NOT
captured, so "never sent" from the scan is a LEAD requiring a bare-string
grep before belief — 6 of the first 7 such leads had senders the scan missed.

**Verified findings, both fixed same-day:**
- `navigateToStep`: wizard listener for "sidebar navigation requests" — the
  sidebar's wizard navigation was retired, NOTHING sends it. Listener + its
  dead callback threading deleted.
- `onGitHubAppRequired`: a SECOND implementation of the
  GITHUB_APP_NOT_INSTALLED reaction that no caller ever wired — the live one
  is ProjectCreationStep's own creationFailed listener
  (GitHubAppInstallDialog). Duplicate deleted.

**Live push channels = the slicing worklist** (sent AND heard; type these,
highest traffic first): `statusUpdate` + `meshStatusUpdate` +
`appBuilderComponentsSnapshot` + `projectDestinationUpdate` +
`appBuilderComponentStatusUpdate` (the dashboard status family — one slice,
they share consumers), `creationProgress`/`creationFailed`/`feedback` (the
creation-progress family), `deployment-status`, the prerequisites family
(`prerequisite-status`/`-install-complete`/`prerequisites-complete`/
`-loaded`), the dalive/github auth families, `configChanged`/
`projectsUpdated`/`demoStateChanged`/`projectDeleted` (projects-list
family), block-library updates, `storefront-setup-*` (wizard EDS family).

**Remaining unverified leads** (run the bare-string grep per type before
acting): `dalive-auth-error`, `prerequisite-check-stopped`,
`authoringExperienceUpdate` on the subscribe side; the sent-side list mixes
in webview→extension REQUESTS (sidebar rows) that belong to
webviewHandlerCoverage's jurisdiction, plus wizard-flow pushes whose
listeners use a different subscription mechanism — the scanner needs the
direction split before its sent-side output is trustworthy.

## Kickoff prompt (per-channel, when one bites)

> Channel `<type>` just caused a bug. Type it end-to-end per
> `.rptc/backlog/2026-08-21-webview-push-channels-are-untyped.md`: declare its
> payload in `@/types/webviewPayloads`, return-type/annotate the sender, derive
> the receiver's cast from the same declaration, fix any divergence the
> compiler surfaces (bug fixes in their own commits, test first), full gate.
> Do NOT type neighbouring channels while you are there — one channel per
> slice is the whole discipline.
