# Step 01b — Tools describe themselves

**Ships:** every tool declares what it IS and what to CALL it, in its own
definition, instead of four surfaces each guessing from its name.
**Depends on:** step 01 (shipped, `f40a7a954`).
**Blocks:** step 04 — the plain-language trace needs authored names and cannot
invent a fourth transform.

## Why this exists

Four surfaces need to know human-facing truth about a tool. Today three of them
DERIVE it from the tool's name, and the fourth is a regex on the same name:

| Surface | Today | Problem |
|---|---|---|
| The chat line while a tool runs | `humanize('deploy_mesh')` | a transform |
| The permission dialog heading | authored for 16 tools, `humanize()` for the rest | half authored |
| The permission dialog's argument list | dumps every scalar the schema declares | see below |
| Read or write (drives the dry run) | `isReadOnlyToolName` regex | a guess |

This repo has already decided this question once. `agentAlertCopy.ts` exists
because four passes of transforming agent-facing text still produced dialogs a
producer should not have been handed, and it carries the rule: **alert text is
authored, never transformed.** Three of the four rows above break it.

The read/write row is now safety-critical, because step 01's dry run trusts it.
The 2026-08-25 audit found the surface clean and one genuine write-in-a-read
(`check_github_app`) held closed by a forced argument — but a regex cannot
express "this is named `check_` and it writes", so the guard had to be discovered
by hand.

## The concrete bug this also fixes

`renderArgsForConsent` (`agentOperationNotifier.ts:75`) prints EVERY scalar
argument, in schema-declaration order. Deleting an Adobe project renders:

```
Demo Builder: Delete an Adobe project?

Deletes the Adobe Developer Console project and everything inside it.
Anyone else using it loses access. This can't be undone.

Project id: 4566206088344572345
Project: bodea
```

The 19-digit id leads; the name — the only line a human can check — is second.
Two others are as bad: `migrate_storefront_name` prints an absolute home path,
`remove_integration` prints a bare `Id:`.

## Build

### 1. Declare it in the tool definition

Use the MCP standard block, not a private field. Verified against the SDK in the
repo: `registerTool(name, config, cb)` accepts `annotations?: ToolAnnotations`
with `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`, and annotations travel to the client in `tools/list`.

Two payoffs for one migration: our own gate stops guessing, AND Claude Code sees
which of our tools are safe, which feeds its own permission behaviour.

The wrapper already receives the config object and already reads `.description`
off it for the consent gate, so the gate reads
`config.annotations?.readOnlyHint` at the **same seam** — no new plumbing.

**Caveat to know before someone reads the spec and worries.** MCP calls these
*hints* and tells clients not to trust them from untrusted servers. That warning
is about a client trusting a remote server. We would be reading our own source at
registration time, which is not the same trust question.

### 2. Fail closed, and make it impossible to forget

Absent declaration = treated as mutating. Plus a test that EVERY registered tool
declares one, so the fail-closed path never actually runs in production. No
fallback to the name regex — that is the soft deprecation this project forbids.
The regex is demoted to a **test-time cross-check**: it must agree with the
declaration except where a row is explicitly listed as a deliberate disagreement.

### 3. Author which argument a human verifies

**This cannot be derived from the tool's shape.** Checked against the real
schemas:

| Tool | Takes | A human verifies |
|---|---|---|
| `delete_project` | `name` | the name |
| `delete_adobe_project` | `projectId`, `projectName` | the name, NOT the id |
| `delete_page` | `path` | the path |
| `set_site_admin` | `email`, `admin` | **both** — grant vs revoke IS the decision |
| `migrate_storefront_name` | `projectPath`, … | the storefront name, not the disk path |

A "prefer `*Name` over `*Id`" heuristic gets `set_site_admin` wrong, and a
"show the first string" heuristic gets `delete_adobe_project` wrong. So it is
authored.

**The master list already exists** — `AGENT_ALERT_COPY`, the 16 tools whose
membership IS the dialog gate. It gains one required field naming the argument
keys to show. Required, not optional, and pinned by a test: a new entry without
it should fail, not silently render nothing.

Audit all 16 while there. That is the whole set — a tool outside the map raises
no dialog, so nothing else can render an argument line.

## Traps

- **Do not migrate half.** The gate reads declarations; until every read declares
  itself, reads would be treated as writes and blocked by the dry run. One pass,
  or the mode silently over-blocks.
- **`title` is not `humanize()` with better spacing.** It is the words a producer
  should see: "Deploy the API mesh", not "Deploy mesh". If the authored title
  equals the transform's output for every tool, nobody actually authored them.
- **Secret masking stays.** `SECRET_KEY_RE` masking is orthogonal to which keys
  are shown and must survive: authoring a key into the shown list must not be
  able to un-mask a credential.
- **`check_github_app` stays read-only in its declaration** — with `skipTrigger`
  forced it genuinely is. The declaration describes the tool AS EXPOSED, not the
  handler in the abstract. Write that reasoning into the row or the next reader
  will "fix" it.

## Tests

- Every registered tool declares `readOnlyHint` — count-pinned, both registration
  paths (the response-envelope guard shipped covering one directory and missed
  ten tools in `src/mcp-server.ts`).
- The dry run honours a `readOnlyHint: false` tool whose NAME is read-shaped:
  register a probe called `get_probe_thing` that declares it writes, and assert
  it is blocked. This is the case the regex cannot express and the whole reason
  for the step — test it by execution.
- The inverse: a write-shaped name declaring `readOnlyHint: true` executes.
- Every `AGENT_ALERT_COPY` entry names the arguments to show, and the dialog
  renders those and no others — assert a planted id argument does NOT appear.
- Secret-shaped keys stay masked even when explicitly listed.

## Done when

All of the above green, `gate` clean, whole-repo lint before pushing, and
`docs/systems/mcp-server.md` updated: the read/write section currently says the
classification is by name, and that stops being true.
