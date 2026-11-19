# Plain failure wording, everywhere (PL-102)

Research pass, 2026-11-19. Hybrid: this codebase, plus outside practice. Read-only; the compiler
probe ran on a throwaway copy of `fix/release-walk-fixes` at `37f85965c` and changed nothing in the
working tree.

**The question.** How do we make "a failure a person reads is in plain words" a rule the whole
extension keeps, the wizard and project dashboard included, the way the datapack windows already do
(release walk F221)? What does it cost, which places get the rule, what do AI agents get instead,
what does a message say when the cause is unknown, and in what order is it built?

## The answer in short

1. **It is a real, measured job, not a small one.** Typing every shared failure field to a
   "plain words" type makes the compiler reject **about 560 to 580 places in `src/`, across about
   155 files**, plus about 120 in tests. 428 of those come from one field: the `error` a handler
   returns to a window.
2. **The type alone is not enough.** The datapack door, `plainFailure()`, lets any text it does
   not recognise through unchanged (`src/features/data-installer/plainFailure.ts:184-185`). Git's
   "repository lacks the necessary blob…" would have passed it. Moved to core as it is, the type
   would only prove "went through the door", not "is plain".
3. **People and agents need two fields, not one string.** An agent's failure text already reaches a
   person: an agent tool's `error` is shown word for word in a VS Code warning
   (`src/features/ai/server/agentOperationNotifier.ts:242`). So the raw words cannot simply move to
   "the agent's copy"; a failure needs a plain field for people and a separate raw field for agents
   and logs. That split was already decided once, on 2026-09-11, and never built
   (`.rptc/plans/error-handling-strategy/overview.md:215-219`: "Those are two fields, not one").
4. **The "Debug Logs" rule is narrower than it has been stated.** What the owner objected to (F221)
   was failure text that named Debug Logs. The owner chose an **Open Debug Logs button** as a failed
   run's action on 2026-11-10 (`.rptc/plans/datapack-simplification/overview.md:298-302`). So: a
   button is endorsed; a sentence sending a person there is not. The house rule for translated
   failures still recommends that sentence, and 23 strings use it.
5. **Recommended shape:** one core door with two layers (plain for people, raw kept beside it),
   the type on the shared fields, a lint rule that bans casting into the type, an honest fallback
   for unknown causes, and the existing words check widened from the data installer to the whole
   tree. Built area by area after beta.153, each area shippable on its own.

## How big: the compiler inventory

Method: the data installer's own `PlainText` type was imported into each declaring file, one field
was retyped at a time, then all together, and `npx tsc --noEmit` and `npm run typecheck:tests` were
run. Both are clean (exit 0) before the change. Raw output kept in the session scratchpad
(`out/B1.src.txt` for the handler field, `out/ALL_NO_LINE.*` for all fields).

| Field typed | Errors in `src/` | Errors in `tests/` | Notes |
|---|---|---|---|
| `HandlerResponse.error` (`src/types/handlers.ts:231`) | **428** | 30 | 110 files. Dashboard 158, data installer 129, EDS 63, projects list 40, authentication 21. Re-counted in the parent: 428 |
| `SimpleResult.error` (`src/types/results.ts`), a second response type | 19 | 13 | Prerequisites, authentication, wizard lifecycle, mesh and App Builder services |
| `OperationOutcome` plus the progress payload's `error`, `warning`, `note`, `details` | 60 | 47 | Mostly funnels: `core/vscode/operationProgress.ts:163,175`, `core/vscode/withOperationProgress.ts:95,97` |
| A run row's `problem.text` | 6 | 10 | `OperationProgressBody.tsx:185` copies the payload error onto a row |
| `UpdateRowStatus.message` | 7 | 14 | Updates window |
| `ResultBody` outcome and lines | 25 | 11 | Lines can only be typed `PlainText \| ReactElement`, so an element still gets through |
| `StatusDisplay` message and details | 18 | 0 | Includes the wizard's Adobe sign-in step and storefront setup |
| `InlineNotice.title` | 19 | 4 | Almost all literals |
| The wizard's creation failure (`CreationFailedPayload.error`, `CreationProgress.error`) | 7 | 6 | `project-creation/handlers/createHandler.ts:145` shows whatever an executor threw |
| Mesh and App Builder status, GitHub and DA.live auth payloads | 10 | 0 | |
| **All failure fields together** | **557 to 579** | **116 to 129** | 153 to 160 files. The parent's recount of the saved output gives 557 / 153 / 116; the probe agent reported 579 / 160 / 129 |

By area, all fields together: dashboard about 215, data installer 147, EDS 72, projects list 42,
authentication 28, project creation 22, shared UI 13, updates 10, mesh 9. **The AI tools and the
commands show 0**, because agent tools write MCP text and commands speak through VS Code
notifications; neither uses these types.

**What the shapes are** (pattern match over the flagged lines, approximate): 194 literal strings,
171 multi-line or variable (need reading), 63 whole handlers flagged as one, 56 templates with
interpolation, 48 caught `.message` / `toError` / `String(err)`, 47 passing another result's
`.error` through.

**Why the count is a floor, not a full list:**
- The progress window gets its text through one or two central functions, so the compiler reports
  the funnel, not each place feeding it.
- Handler maps are typed loosely (`Record<string, AnyMessageHandler>`, returning `Promise<any>`), so
  a handler placed in a map without its own declared type is not checked.
- **Thrown errors are untyped.** Two catches receive anything: the progress window's
  (`operationProgress.ts:175`) and the wizard's creation catch (`createHandler.ts:145`). The
  compiler cannot list what is thrown; those two need translating in place.
- **VS Code notifications** (`showErrorMessage`, `showWarningMessage`): 103 calls in 44 files, on the
  VS Code API's own signature. Typing them needs a small wrapper.
- 56 sites are templates. `plain()` accepts only literals, so a plain sentence built with a name in
  it ("Couldn't change the demo source for {project}") needs a second constructor: a template helper
  that accepts only `PlainText` pieces and names.

## What already translates, and how it folds in

**The datapack door** (`src/features/data-installer/plainFailure.ts`). A branded `PlainText`
(`:25-28`) made only by `mint`, reached through `plain()` (literal-only, `:31`), `plainFailure()` and
`plainLabelled()`. Its translation rules are mostly Commerce's (status meanings, Invalid SKU, URL key
taken); the type, `plain()`, the "no answer in time" rule and the "looks raw" idea are generic. Two
imports tie it to its feature (`:19-20`). **Its gap:** unrecognised, raw-looking-but-not-HTTP text is
minted unchanged (`:184-185`).

**The house rule for translated failures** (`tests/sop/user-facing-errors.test.ts`, 61 ledger rows,
56 never triaged). It matches five line shapes, with the variable names `e`, `err`, `error` written
into the patterns (`:57-63`). It cannot see a string built from tool output several steps away,
which is exactly how the git message travelled: `templateMergeBase.ts` `gitReason` → a `reason`
field → `templateSyncService.ts` → `result.errors.push` → the row. Its "honest generic" is "Could
not reach Adobe Console. See Debug Logs for details." (`:16-17`), repeated in the handbook
(`docs/development/handbook.md:485-487`), ADR-023 (`docs/architecture/adr/023-error-handling.md:38-39`)
and the error-handling plan. **Recommendation:** the type replaces this rule; its ledger becomes the
compiler's worklist and is deleted at the end, and the four documents change with it.

**The three provider formatters** (`docs/architecture/error-handling.md:45-65` lists them):

| Formatter | Reaches a person? | Fold-in |
|---|---|---|
| Adobe sign-in and Console (`authentication/services/authenticationErrorFormatter.ts`) | `formatError` is only logged (`tokenManager.ts:210`, `adobeSignIn.ts:164`). `explainAdobeAccessFailure` / `explainMissingDeveloperAccess` (`:156-182`) do reach people, are actionable, and end "Details are in Debug Logs." (`:138`, `:163`) | Keep the explain functions as the Adobe layer, returning the plain type; drop the Debug Logs sentence |
| GitHub and Helix (`eds/services/errorFormatters.ts`) | Barely. **`formatGitHubError` has no production caller** (tests only, verified). `formatHelixError` has one (`productPageRemoval.ts:147`). Wording is 2025 style ("Please try again", "contact support") | Owner's call: wire it in as the GitHub layer, or delete it under "nothing is soft-deprecated" |
| aio API Mesh (`mesh/utils/errorFormatter.ts`) | Yes, but much is lightly cleaned CLI text: `formatMeshDeploymentError` keeps stderr, `formatApiAccessError` shows "(error 403)", `extractMeshErrorSummary` ends "Check the Debug logs" (`:204`, `:226`) | Rewrite as a real translator; it is the provider with the most raw text reaching the screen |

Other translators found but not examined: `mesh/services/meshDeployWording.ts`,
`eds/services/github/githubOrgRefusal.ts`, `githubWriteRejection.ts`, `updates/services/templateSyncMessages.ts`,
`app-builder/services/runtimeCredentials.ts`, `data-installer/services/dataInstallerErrors.ts`.

**Domain errors.** `src/core/errors/index.ts` defines `FailureShape {code, userMessage, technical?,
recoverable}` (`:47-56`), the two-layer shape this work needs, and only two classes implement it
(`TimeoutError`, `AdobeOrgMismatchError`). About 37 feature errors mix status codes, routes or stderr
into `.message` (`HelixApiError`, `IoEventsApiError`, `ErpIntegrationApiError`, `GitOperationError`,
`CommerceReadError` and others). `TemplateSyncStepError` is the in-repo model: a plain sentence, with
git's output kept apart in `gitOutput` (`templateSyncStepError.ts:9-17`).

## People versus agents

- **Same handlers, same `error` string today.** MCP descriptor tools dispatch into the webview
  handler maps (`ai/server/toolDescriptors.ts:187-226`); `defaultShape` writes `Error: <error>
  [CODE]`, and forwards extra fields as JSON when a failure carries them (`:142-166`).
- **An agent's failure reaches a person.** `agentOutcome.ts:70-75` takes `body.error`;
  `agentOperationNotifier.ts:242` shows it in a VS Code warning (verified). So typing the shared
  `error` field plain is right for people, and the raw words need their own field.
- **Channels that already exist:** `code` (`ErrorCode`), `needsAuth`, `needsUser` with `tellUser`
  ("written for the user", `handoff.ts:63-72`), the data installer's `detail` (raw, for agents)
  beside `shown?: PlainText` (`types.ts:115-129`), `FailureShape.technical`, and the
  `read_debug_logs` tool. Updates' Fix with AI already hands the AI the plain message plus "read what
  Demo Builder logged with read_debug_logs" (`failedUpdatePrompt.ts`).
- **Outside practice agrees.** The MCP specification says tool execution failures carry "actionable
  feedback that language models can use to self-correct", returned with `isError: true`, and servers
  must sanitise tool output ([MCP tools, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)).
  Anthropic's guidance asks for what went wrong plus what to try next, and its own example passes raw
  text ([handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls);
  [writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), vendor
  sources). RFC 9457 keeps a human summary apart from occurrence detail and puts machine data in its
  own members ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)).

**Recommendation:** a failure carries `error` (plain, for people, the type enforced) and a raw
field beside it (proposed `detail`, matching the data installer), which `defaultShape` already
passes to agents. Raw text also always goes to the log. "Names, not codes" still applies to anything
an agent is meant to relay to a person (memory note, owner 2026-11-15).

## The honest fallback, and Debug Logs

**What the record says.** F221 (`.rptc/plans/beta-153-release-tests/overview.md:251`) records the
owner reading failures "each named in Debug Logs" and finding them hard to read. The phrase "sends an
SC to a developer tool" appears only in PL-102's own text; no owner quote of it was found. The owner
chose **Open Debug Logs** as a failed background run's button on 2026-11-10. So the evidence
supports: a button, yes; failure text pointing there, no. That distinction is written down nowhere
and should be, by the owner.

**Where it is used today.** 23 strings send a person to Debug Logs (the backlog listed 18), among
them core's own fallback "The operation stopped unexpectedly. Details are in Debug Logs."
(`operationProgress.ts:175`, verified), `extension.ts:993,999`, `ensureNodeVersion.ts:94,152`,
`commandManager.ts:423,484`, the Adobe formatter (`:138`, `:163`), Updates (`updatesModalHandlers.ts:81`,
`templateSyncMessages.ts:58`, `localStorefrontRefresh.ts:223`) and several EDS commands.

**What outside guidance says about an unknown cause.** Microsoft: "it is better to say An unknown
error occurred than something that is likely to be inaccurate", and do not send people to support
([Windows error messages](https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-error)).
Spectrum: lead with what happened in terms of its effect, offer a way forward, avoid "contact your
IT administrator" ([Spectrum, writing for errors](https://spectrum.adobe.com/page/writing-for-errors/),
read through a summariser). NN/g and GOV.UK reject vague "An error occurred" when the cause is known
([NN/g](https://www.nngroup.com/articles/error-message-guidelines/),
[GOV.UK](https://design-system.service.gov.uk/components/error-message/)). Those agree once split:
specific when the cause is known, honest when it is not.

**Recommended fallback** (fits the dialog design rules, `docs/development/sop/dialog-design.md`):
the outcome in the title ("Couldn't Apply the Update"), one honest line ("Demo Builder couldn't tell
what went wrong."), and the next step as footer buttons: Retry, then Fix with AI, and Open Debug
Logs where the owner has already endorsed it. No sentence names Debug Logs.

## Making the rule hold

Outside practice and this repo agree on the mechanics:
- **The type.** A branded string on a non-exported `unique symbol`, as `PlainText` already is.
  TypeScript has no nominal types ([TypeScript #202](https://github.com/microsoft/TypeScript/issues/202));
  brands are compile-time only ([Zod](https://zod.dev/api#branded-types),
  [Effect](https://effect.website/docs/code-style/branded-types/)).
- **Casts defeat it.** `as PlainText`, `as any` and `as never` all compile. A lint rule closes it:
  `no-restricted-syntax` banning a cast to the type outside the door module, or
  `@typescript-eslint/consistent-type-assertions`
  ([rule](https://typescript-eslint.io/rules/consistent-type-assertions/)). This repo already treats
  a cast at a call boundary as a silenced type error (CLAUDE.md).
- **The brand vanishes over `postMessage`** (JSON only,
  [VS Code webviews](https://code.visualstudio.com/api/extension-guides/webview)). The guarantee holds
  only if both ends read the type from the shared payload declarations in `src/types/`, which is
  already this repo's rule for shapes crossing a boundary.
- **The door must not pass unknown text through.** A core `plainFailure` should map known causes and
  otherwise return the honest fallback, logging the original, instead of minting it as written.
- **A words check for the whole tree.** Widen the F221 half of `tests/sop/datapack-words.test.ts` (no
  API routes, no raw status codes, no Debug Logs sentence, no kind keys) from the data installer to
  every string a person reads; the datapack vocabulary rules stay datapack-only.
- **No prior art found** for branding user-facing failure strings specifically; the closest is typed
  translation keys ([i18next TypeScript](https://www.i18next.com/overview/typescript)). The
  literal-only helper's pattern has only a third-party source; this repo's `plain()` is a working,
  tested instance of it.

## Order of work

Each slice ends shippable: the type lands with `HandlerResponse.error` still `string`, and each area
switches over and goes green before the next.

1. **Core door and decisions.** Move `PlainText`, `plain()`, a template helper and a generic
   `plainFailure()` to core (no pass-through of unknown text); keep Commerce's rules as the data
   installer's layer on top. Add the raw `detail` field and have `defaultShape` pass it. Add the cast
   ban. Change the honest generic in the four documents. Owner settles the Debug Logs wording rule.
2. **The funnels.** Type the progress payload, `OperationOutcome`, run rows and `ResultBody`; translate
   in the two untyped catches (`operationProgress.ts:175`, `createHandler.ts:145`). This alone covers
   every progress window, the wizard's creation failure and Updates (about 70 sites plus two
   catches).
3. **Provider layers.** The mesh translator rewritten, the Adobe explain functions returning the type,
   GitHub decided (wire or delete).
4. **`HandlerResponse.error` and `SimpleResult.error`, area by area.** Dashboard, data installer, EDS,
   projects list, authentication, project creation, then the rest. About 450 sites; most literals
   need only `plain()`.
5. **The rest:** StatusDisplay, InlineNotice, the auth and mesh status payloads, a typed wrapper for
   VS Code notifications.
6. **Close.** Widen the words check to the whole tree; delete the user-facing-errors rule and its
   ledger; record the convention in the handbook.

## Risks

- **Mechanical `plain()` wrapping.** The fastest way to green is wrapping a raw string's variable in
  a cast or a helper. The cast ban plus `plain()` accepting only literals prevent that; reviewers
  should still read every template site.
- **Agents losing specifics.** If a slice types `error` before the raw field exists, agents get less
  to work with. Slice 1 adds `detail` first for that reason.
- **Wording drift.** 560-plus sentences written over weeks. The dialog design rules and the widened
  words check are the guard; a short list of house sentences for common causes helps.
- **The count is a floor.** Loosely typed handler maps hide some sites; thrown errors hide more.
  Tightening the handler map type is worth doing in slice 4.
- **Pre-release scope.** This touches nearly every handler. None of it belongs in beta.153.

## Decisions for the owner

1. **Debug Logs:** confirm "a button is fine, a sentence is not", and that it applies everywhere.
2. **Unknown causes:** approve the honest fallback wording ("Demo Builder couldn't tell what went
   wrong."), or give another.
3. **Show details:** should a person ever see the raw text, behind a "Show Details" control?
   Microsoft endorses it; Apple and GOV.UK lean against. The owner ruled out Show Details for failed
   background runs on 2026-11-10; does that hold for windows too?
4. **`formatGitHubError`:** wire it in as the GitHub layer, or delete it.
5. **Agent text meant to be relayed:** should it be held to the same plain-words type (`tellUser`
   already is in spirit)?

## Owner answers, 2026-11-19

- **2. Unknown causes:** approved. The fallback line is "Demo Builder couldn't tell what went wrong."
- **3. Show Details:** yes. A person may see the raw text behind a Show Details control.
- **4. `formatGitHubError`:** wire it in as the GitHub layer.
- **1. Debug Logs** and **5. relayed agent text:** re-asked in plainer words; open. The
  recommendation stands: keep the Open Debug Logs button, remove the sentence everywhere; and hold
  only text an agent relays to a person (`tellUser`, the agent-failure warning) to plain words,
  with raw words in the separate field for the agent.



- The provider translators listed as "not examined" were not read.
- Material Design guidance could not be fetched; the current Microsoft Writing Style Guide error page
  returned 404; Spectrum's wording came through a summariser.
- The compiler count differs by about 4% between the probe agent and the parent's recount of the
  same output; the range is reported.
- Whether any webview reads failure text from a payload with no shared interface (the `*-error`
  events copied into the agent's progress feed, `progressCapture.ts:91-93`) was not fully mapped.

## Sources

Codebase citations are inline as file:line. Outside sources: MCP specification (tools, 2025-11-25;
2025-06-18 for the change in where input errors go), Anthropic tool-use docs and engineering post
(vendor), RFC 9457, MDN `Error.cause`, Microsoft Windows UX error messages, Adobe Spectrum writing for
errors, Apple Human Interface Guidelines (alerts, writing), Nielsen Norman Group error-message
guidelines (2023), GOV.UK Design System error message, Google technical writing (error messages),
TypeScript issue #202 and 2.7 release notes, Zod and Effect branded types, typescript-eslint
assertion rules, VS Code webview guide, i18next TypeScript.
