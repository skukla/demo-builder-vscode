---
id: AI-1i
kind: fix
area: ai
parent: AI-1
needs: []
value: high
status: shipped
layer: B
---
# The battery destroys its own baseline on every run

## Index hook

*The item in one paragraph.*

**`run.mjs` opens with `writeFileSync(OUT, '')`, so each run erases the previous
results.** The battery exists to compare before against after; it cannot, because
running the "after" deletes the "before". This is the same failure the battery
directory was created to prevent — its own README says the original six prompts
were lost and "anything Evaluation Mode runs must persist its prompts verbatim
alongside its results, or the next measurement can only compare against itself".
The prompts are persisted. The results are not. Found 2026-08-26, immediately
after the first run produced a baseline worth keeping. Filed 2026-08-26.

## The fix

Write to a dated, immutable file per run — `results/2026-08-26T12-19.jsonl` —
and leave a `latest` pointer if something wants one. Never truncate.

Two things to record alongside, or a later comparison is meaningless:

- **The commit the extension was serving.** `mcp-live-probe`'s `info` reports it,
  and the running host is routinely many commits behind what is checked out —
  it was 22 behind during the first run.
- **Cold vs warm.** Cache state alone swung one prompt 55,236 → 8,959 in a prior
  measurement, so an unlabelled token figure cannot be compared to anything.

## Why `high`

Nothing else in the AI-surface work can be shown to help until this is fixed. It
blocks the measurement half of `AI-1g` and `AI-1h`, and it is a few lines.

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  feat(backlog): the report becomes the fix — `unlogged --write` (`2a8eafa1a`)
- 2026-08-26  docs(backlog): what the battery found — two bugs, one gap, one theory killed (`770f7987b`)
- 2026-08-26  fix(battery): results are immutable, and the guard that failed silently (`7008791b4`)
- 2026-08-26  fix(backlog): `Backlog: none` is an answer, not an id (`a82af1b2a`)
- 2026-08-26  docs(backlog): AI-1i built — the record updated itself (`b4cad6f6d`)
- 2026-08-26  Proved by the second run: wrote results/2026-08-26T17-15-22Z.jsonl alongside the baseline instead of truncating it. Both runs on disk, comparison possible.
