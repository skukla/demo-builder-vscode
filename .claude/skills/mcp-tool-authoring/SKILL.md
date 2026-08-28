---
name: mcp-tool-authoring
description: Add a tool to the in-extension MCP server via handler + descriptor row — headless-safety rules, read vs action descriptors, the three declarations every tool needs (readOnly/annotations, a narration phrase, consent copy + target), zod input schemas, guard placement, the count-pinned tests, and the doc sync. Use when exposing new functionality to AI agents (a new MCP tool), promoting an existing webview handler to the tool surface, or when a descriptor/handler-count/annotation/narration test fails after adding one.
---

# MCP Tool Authoring

The in-extension server's descriptor pattern turns an existing handler into an MCP tool
with ~10 lines. The traps are in what qualifies and what else must move.

## The pattern

1. **Handler** in an existing map (`dashboardHandlers`, `aiHandlers`, `meshHandlers`) —
   an ordinary `MessageHandler` returning `{ success, data?, error?, code? }`.
2. **Descriptor row**:
   - Reads → `READ_DESCRIPTORS` (`src/features/ai/server/readDescriptors.ts`)
   - Actions → `ACTION_DESCRIPTORS` (`actionDescriptors.ts`): add `confirm: true` for
     destructive ops; `inputSchema` is a zod shape (validation happens at the tool-call
     layer, so the model retries on mismatch — but the HANDLER must still validate,
     it's also reachable from webviews).
   - `readOnly: boolean` is **required** — the compiler asks. See "Three things every
     tool declares" below.
3. Registered from `extension.ts` (descriptor modules import handler maps, so they stay
   out of the vscode-free server module).

## Three things every tool declares (added 2026-08-25)

None of these can be derived from the tool's NAME, and all three were derived from it
until an audit found what that produced. A new tool is not done without them.

### 1. Read or write — `readOnly` / `annotations.readOnlyHint`

Gates the Evaluation Mode dry run, the chat's opening line and the phase sinks.

- **Descriptor row**: `readOnly: true | false`. Required by `ToolDescriptor`, so a
  missing one is a compile error.
- **Direct registration**: `annotations: { readOnlyHint: <bool>, destructiveHint: <bool> }`
  in the config object. Enforced by a SOURCE scan in `toolAnnotations.test.ts`, because
  most registrars cannot be booted in a unit test.

Missing means "assume it writes" — over-blocked under a dry run, which is the safe
direction. Set `destructiveHint` true when the tool is in `AGENT_ALERT_COPY`.

**Declare what the tool IS AS EXPOSED, not what the handler could do.**
`check_github_app` declares `readOnly: true` even though its handler fires a Helix code
sync on a 404, because `argDefaults: { skipTrigger: true }` makes that unreachable. That
forced flag is pinned by a test; do not remove either half.

The old name regex (`isReadOnlyToolName`) survives only as a cross-check — a declaration
disagreeing with the name must be listed in `RECORDED_DISAGREEMENTS`. Four tools already
are: `select_org` / `select_project` / `select_workspace` (in-memory session targeting)
and `set_setting` (hands back to the user, changes nothing).

### 2. What the chat calls it — `TOOL_NARRATION`

Add a phrase in `toolNarration.ts`. **Every** tool, reads included: the evaluation trace
renders reads in plain language, and repeated reads are the waste it exists to show.

- Completes "Demo Builder is …", so the progressive form: "Deploying the API mesh".
- **Name the object.** "Republishing the storefront", never "Republishing".
- Write it from the tool's DESCRIPTION, never its name. Writing from names is the same
  derivation being removed, done by hand — it produced "Set project pinned…" and
  "Set setting…" (a tool that changes no setting), and it missed two tools entirely.
- There is NO fallback. A tool without a phrase narrates nothing, and four tests in
  `toolNarration.test.ts` make that loud.

### 3. If it raises a dialog — `AGENT_ALERT_COPY`

Membership IS the consent gate; a tool outside the map raises none. Three authored
fields, and the dialog shows these and nothing else, because it answers one question:
*am I allowed to do this?*

| Field | Is |
|---|---|
| `action` | completes "Demo Builder: ___?" |
| `consequence` | ONE sentence: what changes, and name the blast radius |
| `target` | argument keys naming WHICH thing, in reading order |

`target` is `[]` when the tool acts on the open project and declares no argument naming
it (`republish`, `sync_content`) — the dialog names the open project instead.

**Read the schema before writing `target`.** A key that does not exist renders a BLANK
line, not an error, so the dialog quietly stops saying which thing it is about. Two of
the first fifteen were wrong that way. `agentAlertTargets.test.ts` now catches it.
And show what a human can CHECK: `delete_adobe_project` declares `projectId` first and
must show only `projectName` — nobody can verify a 19-digit id.

## The response shape — never build it by hand

One envelope, two builders, both from `mcpToolResult.ts`: `asText(value)` serializes;
`asRawText(text)` wraps a string that is already final (a prose refusal, or the descriptor
registrar's pre-stringified `shape()` output). A tool that hand-rolls
`{content:[{type:'text',…}]}` fails `responseEnvelope.test.ts` — it checks descriptor rows
at runtime and every registrar module at the source, in BOTH halves (`src/features/ai/server/`
and `src/mcp-server.ts`; a new registrar file outside that directory must be added to
`EXTRA_REGISTRAR_FILES` or it is silently unguarded). Worth knowing WHY it is enforced: the
helper was extracted in July to kill this exact duplication and by August it had grown back
into 10 of the 23 registrar modules, one a byte-identical copy under the same name.

Note the surface is NOT all-JSON. Refusals answer prose, including the shared
`"<tool> requires confirm:true to proceed."`, so never write guidance telling an agent
every response parses.

## Headless-safety (the qualifying bar)

A descriptor-exposed handler runs with NO panel: no `sendMessage` dependence for its
result, no modals, no `vscode.window` prompts on the happy path
(`headlessHandlerContext.ts` provides the context). `vscode.window.showWarningMessage`
as a side channel is tolerated; a handler that NEEDS interaction doesn't qualify.

## Guards and side effects

- Adobe-touching tools reuse the existing chains — `runGuards`
  (`appBuilderComponentHandlers.ts`: auth → org-mismatch → developer role) or the
  equivalent for their domain. Never inline org checks (see `adobe-org-context`).
- **No writes hiding in reads**: a read tool must not call anything that creates on
  miss (e.g. `ensureOAuthCredentialId` creates a credential — `list_console_apis`
  derives its `managed` flags from the persisted union instead of probing the live
  credential for exactly this reason). This rule got teeth on 2026-08-25: the dry run
  now trusts `readOnly`, so a write hiding in a read is a real mutation during a mode
  that promises none. If a tool must keep the write, either declare `readOnly: false`
  or force it off with `argDefaults` (the `check_github_app` pattern) — those are the
  only two honest answers.
- Persist state only AFTER the side effect succeeds (`add_console_apis` pattern).

## Not every tool is a descriptor row

Tools that need services rather than a handler map are registered **directly** on the
server, in `src/features/ai/server/*Tools.ts` (`cloudResourceTools`, `storefrontTools`,
`contentAuthoringTools`, …), wired from `extension.ts`. File-based tools that must stay
`vscode`-free live in `src/mcp-server.ts` behind `registerProjectTools`.

Pick by what the tool needs: a handler map → descriptor row; an EDS/Adobe service →
a `*Tools.ts` module; the project directory only → `mcp-server.ts`.

## Never write a shape you have not read

**The most expensive mistake available here, and it always goes green.** Five times across two
sessions, a shape was inferred — from a name, from the writing side, from what seemed reasonable
— and the code plus its test agreed with each other while neither agreed with reality. `tsc`,
`typecheck:tests`, jest and eslint pass every time: an invented shape is still valid JSON and
still typechecks.

Three places it lands, all the same error:

**1. The tool's inputSchema.** Take every field from the handler's payload TYPE, never from the
tool's name. `discover_store_structure` shipped with `environmentType`, guessed from the name;
the handler requires `backendType: 'accs' | 'paas'` and rejects the call without it
(`edsHandlers.ts:89`), so the tool failed 100% of calls with four checks green. Read the payload
interface, and while you are there check what it does with each field — the same read is what
found that PaaS discovery takes an admin username and password, which is a `needsUser` handoff,
not a parameter.

**2. Test fixtures for extension state.** Copy them from a real artifact on disk
(`~/.demo-builder/projects/<name>/.demo-builder.json`), not from memory. A `get_project_status`
test invented `components: [...]` and `frontendPort`; the real shape is a `componentInstances`
RECORD keyed by id, the port lives on the instance whose `type` is `frontend`, and the mesh is a
`dependency`-typed instance found by `subType`.

**3. Which accessor to call.** Two accessors over the same domain object are usually NOT
interchangeable. `getMeshComponentInstance` returns the component instance (its `status` drives
deploying/error); `getMeshAppBuilderComponent` returns the deploy record (endpoint, lastDeployed).
Callers that use both are doing it deliberately — collapsing them reads as a simplification and
reproduces the 2026-08-04 regression where a deployed mesh displayed "Not Deployed".

**4. Fixtures across a network boundary — from a LIVE response.** Twice in one session
(2026-08-16) a fixture was composed from what the WRITING side produces, code was written to
match it, and every check passed:

- `plugins.da.unsafeHTML` is what `promote_block_to_library` writes — and is present on **4 of
  78** real components. The other 74 use `rows`/`columns` or `name`/`type`/`fields`. A tool
  built on the fixture would have failed on 95% of blocks.
- DA.live listings prefix entry paths with **`/{org}/{site}`**, not `/{site}`. The fixture used
  one segment, so `list_content` returned paths no sibling tool accepted.

Capture the real thing with `mcp-live-probe`, then say in the test file where it came from so
nobody "simplifies" it back.

**The tell, in all four cases: you can state the shape but not name where you read it.** That is
the moment to go look, and it costs one `grep` against the type or one `python3 -c` against a
real project file. Every one of these was found later by something more expensive — a live probe
call, or three failing tests written against the invention.

Same class as `webview-test-authoring`'s mocked-vs-bundled-JSON trap.

## The stub server tests BEHAVIOUR. It cannot test REGISTRATION.

Every suite here builds the same fake, and **20 of 22 test files** write it this way:

```ts
registerTool(name: string, _def: unknown, handler) { tools.set(name, handler); }
//                         ^^^^^^^^^^^^^ the tool definition, thrown away
```

That is correct for what those tests do — drive a handler and assert its output. It is also
completely blind to the argument it discards, which is where the SDK contract lives: the input
schema. `tsc` cannot cover the gap either, because `server` is typed `any`.

Two defects shipped through that hole on 2026-08-17, both with green suites:

| What was passed as `inputSchema` | What happened |
|---|---|
| A raw **JSON Schema** object (`{componentId: {type: 'string'}}`) | SDK threw inside `registerExtraTools`, aborting registration for **every** tool. The server bound its socket and never answered a handshake — the whole agent surface was dead for six commits |
| A raw zod **shape** where strictness mattered | The SDK wraps a shape in zod's default `.strip()`, which SILENTLY DROPS unknown keys before the handler runs. `configure_project`'s unknown-key rejection could never fire, so `{addons, stroeScope}` applied the addons and discarded the typo |

**So:** keep using the stub for behaviour, and let `tests/features/ai/server/realSdkRegistration.test.ts`
own registration. It hands the real `McpServer` every module's tools, then all of them on one
server as `extension.ts` builds it — which also catches a duplicate tool name, something no
per-module test can see. Add your registration function to it when you add a tool; that is the
whole maintenance cost.

**Schema rules the stub will not enforce for you:**

- `inputSchema` takes a zod **shape** or a zod **schema** — never raw JSON Schema.
- A raw shape STRIPS unknown keys. When rejecting them matters (any tool that WRITES), pass
  `z.object({...}).strict()` instead and assert it with `schema().safeParse(...)`, not through the
  handler. `additionalProperties: false` appears in the published schema either way, but that only
  protects clients that validate — it is not server-side enforcement.

## Verify against the running server before calling it done

Green tests mean the tool matches its fixtures. Use `mcp-live-probe` to check it matches
reality — and to read `serverInfo`, which names the build that is actually answering
(the socket is shared and last-writer-wins, so "I just rebuilt" is not evidence).
Extension-host changes need **F5**; Cmd+R reloads only the webview.

To check a bundle, grep the **tool-name string literal**, never the registration function —
esbuild renames identifiers, so `grep registerContentAuthoringTools dist/extension.js` returns
0 on a perfectly good build.

## What else moves (the checklist)

- `dashboardHandlersMap.test.ts` pins the EXACT handler count — bump it with the
  arithmetic comment.
- `inExtensionMcpServer.test.ts` pins the `registerProjectTools` tool list BY NAME
  ("serves the N project tools over the socket") — add yours and update the count word.
- Descriptor suites: `readDescriptors`/`actionDescriptors`/`toolDescriptors` tests.
- **The three declarations** (see above), each with a test that fails without it:
  `toolAnnotations.test.ts` (read/write, both registration paths),
  `toolNarration.test.ts` (a phrase, and no orphan phrase left behind), and
  `agentAlertTargets.test.ts` (only if the tool raises a dialog).
- `docs/systems/mcp-server.md` — the descriptor-driven tool list (§ "Descriptor-driven
  tools") and, if agent-facing behavior changed, the flow sections.
- If agents should DISCOVER the tool proactively, teach it: generated AGENTS.md section
  and/or a generated skill — that's `ai-context-authoring` territory (including the
  AI_CONTEXT_VERSION bump).
- Tool NAME/description are the agent's search surface: short snake_case name, one-line
  description saying WHEN to use it (deferred tool loading ranks on these).

## Spawning a command: `shell: true` is NOT optional

`CommandExecutor.execute(command, opts)` defaults `shell` to **false**
(`commandExecutor.ts`: `options.shell || false`) and hands the whole string to
execa as the **executable name**. So a command with arguments never starts — and
because execa is called with `reject: false`, it does not throw either. The caller
gets empty stdout and a result that looks fine.

Cost on 2026-08-25: a prompt evaluation returned in **two milliseconds** and
rendered as "Nothing was changed. 0 steps, $0.00, 0s, nothing wasted" — a total
failure wearing the clothes of a clean result. Eleven other callers in this repo
already pass `shell: true`; the new one did not, and nothing in the type system
or the tests could see the difference.

Two rules:

1. **Pass `shell: true`** whenever the command string carries arguments.
2. **Treat unparseable stdout as a FAILURE**, never as empty data. Defaulting
   fields to zero is how a dead process renders as a working feature.

## Logging

`withToolLogging` wraps every tool: name + arg KEYS only (args can carry secrets).
Never add value-logging inside a handler that tools reach.
