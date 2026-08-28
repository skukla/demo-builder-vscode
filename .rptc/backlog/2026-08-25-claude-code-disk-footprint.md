---
id: PL-4
kind: chore
area: platform
needs: []
value: low
status: shipped
layer: G
---
# Claude Code's storage grows ~4 GB a year, and nothing reports it

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**Measured 2026-08-25 while checking whether Evaluation Mode needed a data-management surface — it does not (78 KB per project, capped on two axes, asserted by a test), and the measurement found this instead.** On the owner's machine five months in: `~/.claude` is **2.2 GB**, of which 1.7 GB is session transcripts (323 files, oldest 24 March, nothing deletes any of it), plus 371 MB of plugins and 160 MB of file-history. Growth from the oldest and newest transcript dates: **11 MB/day → 331 MB/month → ~4 GB/year**, transcripts alone. Not our data, but it accumulates from work done THROUGH this extension, it sits beside our own storage where a producer cannot tell whose is whose, and we already own the surface that would say so — "Demo Builder: Diagnostics" reports on the environment and this is environment. **Build a REPORT, not a manager**, and the rule is deliberate: a cleanup button is the obvious next idea and is more dangerous than it looks, because transcripts are how `--continue` works (`claudeSessionStore.hasConversation` probes for a `.jsonl` to decide whether the Chat tile can resume), so deleting the wrong file breaks resuming silently and the producer experiences it as "my chat forgot everything". Report total, largest subdirectories, oldest transcript, and the path; let them run `rm` themselves. Compute on demand — do NOT walk a 2.2 GB tree on activation (the `buildStampUi.ts` precedent is explicit that the expensive walk is the on-demand half). Filed 2026-08-25.

## Provenance

Measured 2026-08-25 while checking whether Evaluation Mode needed a data-management
surface. It does not — 78 KB per project, capped on two axes, asserted by a test.
The measurement found something else.

## What was measured

On the repo owner's machine, five months into using Claude Code through this
extension:

| Path | Size |
|---|---|
| `~/.claude` **total** | **2.2 GB** |
| `~/.claude/projects` (session transcripts) | 1.7 GB, 323 files |
| `~/.claude/plugins` | 371 MB |
| `~/.claude/file-history` | 160 MB |
| `~/.claude/history.jsonl` | 11 MB |

Oldest transcript: **24 March**, still present. Nothing deletes any of it.

**Growth rate**, from the oldest and newest transcript dates (154 days, 1.7 GB):

    11 MB/day  →  331 MB/month  →  ~4 GB/year

That is transcripts alone. Plugins and file-history are additional and were not
rate-measured.

## Why it is OUR problem even though it is not our data

We neither write it nor own it. But:

- It accumulates from work done THROUGH this extension — every Chat tile launch,
  every prompt evaluation, every skill run adds to it.
- It lives beside our own storage in the same home directory, so a producer
  seeing a full disk has no way to tell whose it is.
- **We already own the surface that would say so.** "Demo Builder: Diagnostics"
  (`src/commands/diagnostics.ts`, report shape in `diagnosticsReport.ts`)
  reports on the environment; this is environment.

## What to build: a REPORT, not a manager

Add the footprint to the diagnostics report — total, the two or three largest
subdirectories, the oldest transcript date, and where it all lives.

**Do not delete anything, and do not offer to.** Stated as a rule because a
cleanup button is the obvious next idea and it is more dangerous than it looks:

- **Transcripts are how `--continue` works.** The extension's own Chat tile
  launches `claude --continue`, and `claudeSessionStore.hasConversation` probes
  `~/.claude/projects/<encoded-cwd>/` for a `.jsonl` to decide whether a
  conversation can be resumed. Deleting the wrong file silently breaks resuming —
  the producer would experience it as "my chat forgot everything", with no way to
  connect that to a button they pressed.
- It is another program's storage. Deleting it on the user's behalf is a promise
  about a format we do not control and does not version with us.
- `file-history` is Claude Code's undo data. Its consequences are even less
  visible.

Report the number, name the directory, let the producer decide. If they want it
gone, `rm` is theirs to run.

## Scope

Small. A recursive size walk over a handful of known paths, cached or computed on
demand (Diagnostics is already an on-demand command, not an activation cost), and
a few lines in the report.

**Do NOT walk it on activation.** A 2.2 GB tree is not free to stat, and the
existing build-stamp precedent (`buildStampUi.ts`) is explicit that the expensive
walk is the on-demand half for exactly this reason.

## What this is NOT

- Not a data-management UI for Evaluation Mode. That data is 78 KB per project
  and capped; a screen would imply there is something to manage.
- Not telemetry. This is a local measurement shown to the person whose disk it is.

## Kickoff prompt

```
/rptc:feat "Report Claude Code's disk footprint in Demo Builder: Diagnostics. Read
.rptc/backlog/2026-08-25-claude-code-disk-footprint.md first — it has the measured numbers,
and the reason a cleanup button is deliberately out of scope (transcripts are how
--continue works). Report only: total, largest subdirectories, oldest transcript, path.
Compute on demand, never on activation."
```

## Shipped so far

- 2026-08-27  Shipped on loop/2026-08-27-starter-kit: Diagnostics now reports the ~/.claude footprint — total, largest subdirs (top 3), transcript count/size/oldest — computed only when the command runs (never activation), rendered with the resume caveat and no cleanup affordance, exactly as the item ruled. New module src/commands/claudeCodeFootprint.ts; 8 tests against a real temp tree incl. a pin that the output never offers deletion.
