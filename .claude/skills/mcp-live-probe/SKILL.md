---
name: mcp-live-probe
description: Talk to the RUNNING in-extension MCP server over its Unix socket — read serverInfo to learn which BUILD is answering, list/inspect tools, and call one to see its real response and token cost. Use when adding or auditing an MCP tool, measuring response size, verifying a tool against live data instead of fixtures, or when a tool "should" work but doesn't. Also the tree-provenance check before quoting any tool-surface number.
---

# Probing the live MCP server

**Tests prove a tool matches its fixtures. Only this proves it matches reality.**

Three bugs in one session (2026-08-16) passed jest, `tsc`, `typecheck:tests` and eslint, and
were caught only by calling the running server:

| Bug | What the offline checks saw |
|---|---|
| `list_content` returned `/skukla/demo-builder-test/apparel`, a path no sibling tool accepts | A fixture with a site-only prefix, and code that agreed with it |
| `get_block_authoring_shape` read only `unsafeHTML` — present on 4 of 78 real blocks | A fixture built from what the promote flow writes |
| `read_published_page` reported `bytes` that were UTF-16 code units | Nothing. Only a diff against `curl` exposed it |

The first two are one failure: **an invented fixture plus code written to match it.** Both suites
went green. No typechecker can see it — a made-up shape is still valid JSON.

## Use it

```bash
P=.claude/skills/mcp-live-probe/probe.mjs

node $P info                          # which BUILD is serving + tool count + tree provenance
node $P list [pattern]                # tool names + descriptions, optionally filtered
node $P schema <tool>                 # the tool's inputSchema as the agent sees it
node $P call <tool> '<json args>'     # call it; prints byte size and ~token cost
```

Flags: `--socket <path>` (when discovery is ambiguous), `--full` (don't truncate),
`--force <tool>` (permit that ONE non-read-only tool).

## Read `info` FIRST, every time

```
serving: feature/ai-surface-coverage@12cb63da+ built 2026-08-16T20:53:38.568Z from …/worktrees/feature/ai-surface-coverage
tools:   65
tree:    data-installer merged (6 datapack tools)
```

Three things it settles, each of which has produced a wrong answer before:

1. **Which build is answering.** The socket name is `sha256(projects-root)` — identical across
   windows — and the **last host to start silently rebinds it**. A probe at 15:42 and another at
   15:44 returned 52 tools then 58, because a different host took the socket in between. The
   `serverInfo.version` string (branch@commit + build time + worktree) is the only reliable
   answer; a trailing `+` means the build had uncommitted changes.
2. **Whether your change is even loaded.** If the timestamp predates your last `npm run compile`,
   you are testing the old build. **Extension-host changes need F5, not Cmd+R** — Cmd+R reloads
   only the webview.
3. **Tree provenance**, in the SAME connection as the measurement. Never run it as a separate
   invocation: a different host can rebind between two connections, and then the provenance
   describes one build while the numbers describe another.

## When it times out: diagnose on the SECOND failure, never retry a third time

`timed out after 60s — is the host still running?` is not "try again". A dead socket file
produces exactly the same message as a host that is mid-startup, so retrying cannot tell them
apart — and each attempt costs a full minute. On 2026-08-17 this ran **six** times across a
dead socket. One command would have settled it after the second.

Run this instead. It answers in under a second:

```bash
S="$(ls "${TMPDIR}demo-builder-mcp"/*.sock 2>/dev/null | head -1)"
echo "socket:   ${S:-<none>}"
[ -n "$S" ] && { stat -f '%Sm' "$S"; echo "holders:  $(lsof "$S" 2>/dev/null | wc -l)"; }
echo "host:     $(ps aux | grep -c '[e]xtensionDevelopmentPath') process(es)"
```

| socket | holders | host | Meaning |
|---|---|---|---|
| present | 0 | 0 | **Stale file — no host.** Nothing will ever answer. Ask for F5; `rm` the socket |
| present | >0 | ≥1 | Host is up and mid-startup. ONE more probe is reasonable |
| absent | — | ≥1 | Host starting, has not bound yet. Wait, then probe once |
| absent | — | 0 | No host. Same ask as row 1 |

**A rebuild is not a run.** `npm run compile` and the watch task refresh `dist/extension.js` and
start nothing — so the bundle timestamp keeps advancing while the probe keeps timing out, which
reads exactly like "my change isn't loading". Only **F5** launches the
`[Extension Development Host]` window that binds the socket. Before blaming the build, ask
whether that second window is actually open.

**Check your detection before trusting it.** `ps aux | grep extensionDevelopmentPath` returning 0
is only evidence if `ps` works at all here — pair it with a positive control
(`ps aux | grep -c 'Code Helper'`, which should be double digits on any machine running VS Code).
A zero from a broken pattern looks identical to a zero from no host.

**A wrong-build answer counts as a failure too.** Between two timeouts, one probe answered from
`feature/bodea-template` — a sibling worktree's host had taken the socket. It was a real response
to a real server and would have described the wrong branch entirely. This is rule 1 of `info`
above, and it fires most often exactly when you are re-probing after a restart.

## Verifying a bundle without the probe

When you only want to know whether something compiled in, grep `dist/extension.js` for the
**tool-name string literal** — never an identifier:

```bash
grep -c '"read_page"' dist/extension.js        # 1  — string literals survive
grep -c 'registerContentAuthoringTools' dist/extension.js   # 0 — esbuild RENAMES identifiers
```

That zero looks exactly like a failed build. It cost a wrong "the build is broken" conclusion
until a negative control (`not_a_real_tool` → 0) and a positive one (`sync_content` → 1) showed
the check itself was wrong, not the build.

A fresh worktree has an **empty `dist/`** — nothing is built until `npm run compile` or F5's
`preLaunchTask`. See `worktree-setup`.

## Only read-only tools run without `--force`

`call` runs a tool unprompted only when its name reads as a query — `list_*`, `get_*`, `read_*`,
`check_*`, `find_*`, `verify_*`, `inspect_*`, `show_*`, `describe_*`. Everything else needs
`--force`. `info` prints which tools are gated.

This guard exists because two standing rules collide badly: **never call a state-changing tool
merely to measure it**, and **8 tools take no required arguments** — so an enumerate-and-call
sweep with `{}` fires them against live resources.

**It began as a denylist of destructive-sounding names, and that was wrong.** A review found it
let `sync_content` and `republish` straight through: both take zero arguments and both push to
the live public CDN, which is precisely the accident the guard existed to stop. `write_page`,
`publish_page` and `update_project_config` were open too. A denylist has to enumerate every
dangerous tool correctly, forever, including ones not written yet; an allowlist fails closed when
a new tool appears. Prefer the allowlist even though it is blunter — a false positive costs one
flag, a false negative costs a GitHub repo or a live storefront.

**`--force` names its tool, and that is not cosmetic.** It was a bare boolean until a script
looped over 17 supposedly-gated tools passing it blanket. Two of the 17 had no gate — the
classifier that produced the list had matched `confirm:true` inside an error MESSAGE
(`sign_in(provider:"github", confirm:true)`) rather than a gate declaration — and `republish` ran
against a live storefront, pushing a commit and publishing to the CDN. A blanket override is
precisely the shape that accident requires. `--force delete_page` unlocks `delete_page` and
nothing else.

Before any `--force` call, confirm with the user and use a resource you can afford to lose.

## Do not classify tools by reading their source

Three attempts at "which of these tools are gated?" produced three confident wrong answers in one
session: socket calls that failed into `{}` while the host was restarting (indistinguishable from
"declares no confirm"), a fixed-size text window that bled into the NEXT tool's registration, and
a regex that matched prose describing a gate as if it were one. A control caught the second and
missed the third, and on one occasion the CONTROL itself was wrong — `open_view` does have a gate.

If you need to know how a state-changing tool responds, drive its handler in a test with mocked
services. That runs the real shaping code, measures the real output, and cannot misclassify,
because it does not classify.

**Flags never consume the argument after them.** `--full` and `--force` are booleans;
`--socket` requires a value and errors without one. The first version consumed the next token
whenever it did not start with `--`, so `call delete_page --force '{"path":…}'` dropped the JSON
and called the tool with `{}`. A probe whose own parser silently changes what you called is worse
than no probe.

## Measuring response cost (this is phase 2's whole job)

`call` prints byte size and a ~4-bytes-per-token estimate. Real figures from this repo:

| Tool | Bytes |
|---|---|
| `get_block_authoring_shape` (one block) | 92 |
| `read_page` (a real home page) | 12,664 |
| `verify_ai_setup` | 18,778 — one call costs more than the entire tool catalogue |

Two rules the numbers teach: split an **index** from a **detail** call when the index is what
gets called repeatedly, and never let a tool return a payload the agent must then re-derive.

## Turning a live response into a fixture

**For anything crossing a network boundary — DA.live, Helix, GitHub, Adobe — copy the fixture
from a real response.** Do not compose it from what the writing side produces, which is the
mistake behind two of the three bugs above: the promote flow writes `unsafeHTML`, so a fixture
built from it described 4 of 78 blocks.

```bash
node $P call list_content '{}' --full     # then copy the real shape into the test
```

Then state in the test file *where the fixture came from*, so the next person does not
"simplify" it back to the invented shape.

## Verify

The probe fails loudly rather than silently: no socket directory, no sockets, or more than one
socket all exit non-zero with the reason. If `info` prints `(unknown …)` for the build, the
running host predates `06ffe079` and you cannot tell which build is serving — restart it before
trusting anything else.

_If this skill was wrong or incomplete, fix it before closing the task._
