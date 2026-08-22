# The other webview message channels are still untyped

**Filed:** 2026-08-21
**Push-channel campaign COMPLETE 2026-08-21** — every live extension→webview
push channel now has ONE declaration in `@/types/webviewPayloads` that both
sides check against (commits `efd83a05`…`f5a5a39b` on top of the dashboard
family). What remains in this item is the OTHER direction: the
webview→extension request/response contracts and the cast clusters listed
below, which die when those request payloads get one declaration each.
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

**Live push channels — ALL DONE 2026-08-21** (one commit per family):
- dashboard status family (`statusUpdate`/`meshStatusUpdate`/
  `appBuilderComponentsSnapshot`/`projectDestinationUpdate`/
  `appBuilderComponentStatusUpdate`) — earlier commits; found the missing
  resetting/republishing states + the ProjectStatus name collision.
- creation family (`creationProgress`/`creationFailed`) — `efd83a05`. Dead
  deleted: `creationComplete` + `creationCancelled` pushes (the progress
  sentinels are the live signal) and the ENTIRE `feedback` channel (sender
  `_sendFeedback` had zero callers AND the listener read fields the sender
  never sent — dead on both ends).
- `deployment-status` + prerequisites family — `7d7fff3e`. Dead deleted:
  `prerequisite-check-stopped` listener (no sender), the install request's
  id/name echo (handler reads prereqId only). Drift fixed: loaded `id` is a
  NUMBER (was typed string), loaded plugins are config identity without
  `installed`, status `message` is optional, raw config entries (with install
  commands) no longer shipped to the webview.
- github/dalive auth families — `a8d78196`. Dead deleted: `dalive-auth-error`
  listener (no sender), the login-opened `instructions` field. Drift fixed:
  FOUR GitHubUser twins unified (services original, hook twin, WizardState
  inline, GitHubServiceCard export) — nullable fields were being retyped as
  optional strings.
- projects-list family + block-library updates — in `f5a5a39b` (shapes
  agreed; typed end-to-end).
- `storefront-setup-*` family — `f5a5a39b`. Dead deleted:
  `storefront-setup-cancelled`/`-cancel-aborted` pushes (cancel arrives on
  unmount — nobody left to hear), `isTeamOrg` field. Drift fixed: the phase
  union was missing `auth-recovery`/`complete`; **two receiver bookkeeping
  branches were provably dead** — repoCreated was gated on
  `phase !== 'repository'` while every repo-info push IS 'repository'-phase
  (so cancelling mid-setup never cleaned up the created repo), and
  contentCopied compared the wire's `complete` against the local `completed`.
  Both fixed.

**Leads — all resolved 2026-08-21:** `dalive-auth-error` and
`prerequisite-check-stopped` were dead listeners (deleted);
`authoringExperienceUpdate` is live on both sides and typed. Remaining
scanner homework if the inventory script is ever re-run: it must learn the
`postMessage({type: 'X'})` send style and split webview→extension REQUESTS
out of the sent-side list before its output is trustworthy.

## Request direction — substantive contracts DONE 2026-08-22

Home: `src/types/webviewRequests.ts` (sibling of webviewPayloads; same rules).
Commits `579cd40b`…HEAD. Done, one family per commit:

- **create-project** (`ProjectCreationConfig` moved from the executor;
  `buildProjectConfig` return-annotated; `ProjectConfigSource` Pick so the MCP
  tool's synthesized states typecheck). Killed the executor/tool/setup-context
  `as unknown as` cluster. **Bug-class find:** `AdobeConfig`'s four required
  fields were fiction — real manifests hold as little as
  `{organization, organizationName}`; made honest with ZERO new compile
  errors (every consumer already optional-chained).
- **get-components-data** (`ComponentsDataPayload`/`GetComponentsDataResponse`;
  DTO configuration typed; collector's `as never`/`as T` dead). Dead code
  deleted: `ComponentSelectionStep` + `useComponentSelection` +
  `useConfigValidation` (no renderer since the build-your-project
  consolidation) and PrerequisitesStep's never-read `componentsData` prop.
  Also deduped the two byte-identical `ComponentConfigs`/`ComponentConfig`
  declarations.
- **AddIntegrationFlowAdapter cluster** (`WizardSessionState` /
  `AdobeAuthSessionState` — the borrowed-modal contract stated instead of
  cast past; `useSelectionStep.selectedItem` declares the id-only stub shape
  its own hydration doc always promised). All four `as never` dead.
- **storefront-setup-start/cancel** (+`StorefrontSetupPartialState` — the
  step's byte-identical twin deleted). Sender edge added: `toStartEdsConfig`
  converts the wizard's optional-fields EDSConfig to the request's required
  shape or refuses with an error state. Twins killed along the way:
  `selectedRepo` inline four-field copy → `GitHubRepoItem` (whose `htmlUrl?`
  was fiction — every producer sets it); `githubAuth.user` optional-strings
  copy → the nullable `GitHubUser`.
- **prerequisites requests** (check/continue/install) + **dashboard
  addAppBuilderComponent / setProjectDestination** (adapter's `postAdd` was
  `Record<string, unknown>`).

Cast ratchet over the campaign: 40 → 31.

### Remaining tail (LOW priority — declare on next touch)

~45 small action requests (`openExternal {url}`, `selectProject {path}`,
start/stop/restart demo, open* commands, AI prompt CRUD, dalive token store
requests, mesh/api checks, projects-list actions). All payload-less or
one/two-field; handlers type them inline and nothing casts responses. Not
worth a speculative pass — give a channel its declaration in webviewRequests
the next time a slice touches it.

## Kickoff prompt (per-channel, when one bites)

> Channel `<type>` just caused a bug. Type it end-to-end per
> `.rptc/backlog/2026-08-21-webview-push-channels-are-untyped.md`: declare its
> payload in `@/types/webviewPayloads`, return-type/annotate the sender, derive
> the receiver's cast from the same declaration, fix any divergence the
> compiler surfaces (bug fixes in their own commits, test first), full gate.
> Do NOT type neighbouring channels while you are there — one channel per
> slice is the whole discipline.
