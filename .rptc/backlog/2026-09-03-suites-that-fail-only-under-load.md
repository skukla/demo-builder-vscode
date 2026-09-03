---
id: PL-41
kind: fix
area: platform
needs: []
value: med
status: active
---

# Three suites fail only under full-suite load, and it costs real pushes

Each passes alone, repeatedly, in about a second. Each has failed a `npm run
gate` inside the pre-push hook, on commits that could not have caused it —
including a docs-only commit.

| suite | what it does | observed |
|---|---|---|
| `inExtensionMcpServer.socketOwnership` | binds and rebinds real unix sockets | 4/4 alone in 1.26s; `start()` exceeded 3s, then 8s, under a full run |
| `core/shell/processCleanup` | spawns real child processes | passes alone; timed out once in a full run |
| `executor-edsStandardFlow` | mocked, no real resources | passes alone; timed out twice at the 10s default |

## What it is not

Not a hang in the code under test. `InExtensionMcpServer.start()` is a `mkdir`,
a liveness probe capped at `SOCKET_PROBE_TIMEOUT_MS = 500`, and a bind. Nothing
in that path can take seconds. Raising the step ceiling 3s → 8s did not help,
which is the evidence that the ceiling was measuring the wrong thing.

The third row is the one that rules out "real resources are slow": it mocks
everything and still times out. What the three share is that they were **starved
of CPU**, not blocked on I/O.

## Why it matters beyond the noise

- It **blocked pushes four times** on 2026-09-03. Each cost a diagnosis, a
  re-run, and once a wrong conclusion (a timeout was attributed to the wrong
  file, because the failing suites were read from one blob).
- A gate that fails for reasons unrelated to the change teaches people to
  re-run rather than read, which is exactly how a real failure gets waved
  through.

## Worth measuring first

1. **How many workers does jest use here, and how many cores are there?** If
   `maxWorkers` is unset it defaults to cores-1, and the two goal-queue sessions
   ran their own suites concurrently with this one for part of the day.
2. **Does `--runInBand` for these three fix it?** Jest can pin specific projects
   or files; if starvation is the cause, serialising the real-resource ones
   should be enough.
3. **Is `executor-edsStandardFlow` slow for its own reasons?** It is the odd one
   out — no real resources — so it may be a different problem wearing the same
   symptom.

## What was done in the meantime

`inExtensionMcpServer.socketOwnership`'s step budget is now 20s, bounded by the
file's own 30s timeout rather than guessed from observed timings. It exists to
NAME a hung step, not to assert performance, and at 3s and 8s it was doing the
opposite — failing runs on a busy machine while a real hang would still be
caught at either number.

## Shipped so far

- 2026-09-03  fix(test): the socket step budget stops guessing, and the load problem gets an item (`c1407098a`)
- 2026-09-03  fix(tests): the two suites that fail only under load get the headroom the third already had (`96234cfe2`)
