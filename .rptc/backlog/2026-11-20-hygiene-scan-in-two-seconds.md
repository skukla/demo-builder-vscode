---
id: PL-109
kind: fix
area: platform
needs: []
value: low
status: backlog
---

# The record scan should take a second or two

Filed 2026-11-20, the dev-pipeline thread's item DP-11 (the change is in this repo).
`.claude/skills/rptc-hygiene-scan/scan.sh` took 18.8 s over about 700 files on a busy machine,
mostly starting processes per file. The pipeline's turn-end drift check runs it, now with its own
45 second limit, so a slow scan is stopped whole and reports nothing.

Fix: read the files in one process (one node or python pass over the backlog and plans) instead of
a process per file. Keep every section's CONTROL line, and prove the faster scan prints the same
findings as the old one on today's tree before replacing it.

## Shipped so far

- 2026-11-20  docs(backlog): file the pipeline review's Demo Builder items (`2d3fa91a7`)
