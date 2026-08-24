# Step 03 — The runner: one implementation, three doors

**Ships:** evaluating a prompt as a capability, reachable by the agent, by a
command, and by the view.
**Depends on:** steps 01 and 02.

## The principle

Evaluating a prompt is a capability, not a screen. **One service backs all three
doors** so the paths cannot drift — the `call-path-audit` rule that a user action
has one definitive path.

## The service

Given a prompt: spawn `claude -p --output-format json` with dry-run **forced on**,
read the result object, join it with the step-02 trace, return both.

The extension already spawns Claude (`src/commands/openInClaude.ts`) — the spawn
is not new ground, though note that file's hard-won lesson: deliver the prompt as
an argument, never via a timed paste (tried twice, always raced cold start).

**What the run's own output gives** (verified 2026-08-24, do not re-derive):

```
usage            input / output / cache-read / cache-create / thinking
modelUsage       per-model, with costUSD
total_cost_usd   real dollars
num_turns, duration_ms, permission_denials, session_id
```

**Report cost in DOLLARS.** "$0.21" means something to a demo builder; "47,550
tokens" does not. Tokens belong on expand, beside the tool names.

## Door 1 — the agent, on the user's behalf

An MCP tool `evaluate_prompt({ prompt, runs? })`, so a user can say *"evaluate
this prompt"* in normal chat. Follow `mcp-tool-authoring`. Three constraints,
none optional:

1. **Recursion guard.** The spawned run must NOT have `evaluate_prompt` in its
   allowlist. Without it an evaluation can evaluate itself without bound. **Test
   this by execution** — it is the failure that bills in a loop.
2. **Cost honesty.** It spawns a real run: real tokens, 30s–2min. Mark
   `confirm: true` so the existing consent gate states the cost first. This is
   the one place a read-shaped tool earns a confirm — not because it destroys,
   but because it spends.
3. **Dry run forced**, never inherited from the global toggle. An evaluation is
   always a dry run regardless of what the status bar says.

Also required by `mcp-tool-authoring`: descriptor row (or a `*Tools.ts` module —
pick by what it needs), the count-pinned test bump with its arithmetic comment,
an entry in `docs/systems/mcp-server.md`, and a row in
`realSdkRegistration.test.ts` (the stub server cannot see registration).

Take the input schema from the handler's payload **type**, never from the tool's
name — five defects in two sessions came from inferring a shape, and all went
green.

## Door 2 — a VS Code command

For a human who does not want to chat. Same service.

## Door 3 — the view

Step 04. Same service.

## Tests

- **Recursion guard, by execution**: the spawned run's allowlist excludes
  `evaluate_prompt`.
- Dry run is forced even when the global toggle is off.
- The service returns cost and trace joined for one run.
- `confirm: true` is set on the tool, and the consent gate sees it.

## Done when

All three doors call one service; the recursion guard is proven by execution, not
by reading the allowlist; `gate` clean; the `mcp-tool-authoring` checklist is
fully worked (count pin, docs, real-SDK registration).
