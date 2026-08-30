# Shell execution

Everything this extension runs on the user's machine goes through `CommandExecutor`.
Nothing calls `child_process` directly.

## Why a queue and not just `exec`

The commands here are mostly `aio` and `git`, and several of them mutate global
state on the machine. Two running at once corrupt each other rather than merely
interleaving. So:

- **`commandQueue.ts`** serialises execution.
- **`resourceLocker.ts`** gives mutual exclusion per *resource*, so operations
  touching different things still run concurrently while two touching the same one
  do not.

## The Adobe org problem — the least obvious thing here

`aio`'s org / project / workspace selection is **a single process-global config**,
and the IMS token is identity-scoped. There is no per-command `--org` flag to reach
for. `orgContextEnv.ts` therefore targets an org by building the environment for
each individual child process.

It lives in `core/` rather than in the authentication feature because the executor
consumes it and core must not depend on a feature. Feature code re-exports the same
symbols; that is deliberate, not duplication.

The full model is in
[adobe-org-context](../../../.claude/skills/adobe-org-context/SKILL.md). Do not
write an ad-hoc org comparison anywhere else.

## Node versions are resolved at the point of consequence

`ensureNodeVersion.ts` makes a Node major available through fnm **on demand**, when
something is about to need it — not during the prerequisites step.

That looks redundant until you trace the paths: the prerequisites step runs before
integrations are chosen, and the dashboard and MCP add-paths never pass through it
at all. Checking early would miss every choice-dependent need. The add door is the
one chokepoint all paths share, so the check lives there.

## Caching

`commandResultCache.ts` caches within a session, keyed by **command plus Node
version** — the same `aio --version` under two Node majors is two answers, and a
cache keyed on the command alone would return the wrong one.

## Also here

`retryStrategyManager` (backoff), `pollingService`, `fileWatcher`,
`processCleanup` (tree kill), `rateLimiter`, `portChecker`, `buildComponent`.
Each is small and does what its name says.

## Related

- [`@/core/validation`](../validation/README.md) — every value reaching a command
  passes through it first; that ordering is a security property, not a preference
