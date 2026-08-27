---
id: PL-7
kind: fix
area: platform
needs: []
value: low
status: shipped
---

# rptc-hygiene-scan check 5 parses zero active entries

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-27, from the quality-sweep loop's closing hygiene run.

Check 5 ("Shipped work still sitting in an ACTIVE backlog section") printed its
own failure marker:

    control: 0 active entries scanned against 245 archived item(s)
    ⚠️  CHECK BROKEN — no active entries parsed

The check's control caught it — that half works. The parse of active entries
returns zero against a backlog with 55 real items, so the check has silently
verified nothing since whenever the README's section format last changed
(likely the `backlog.mjs sync` regeneration, which rewrites the spans the
scan's parser was written against). Until fixed, "shipped work lingering in an
active section" is an unwatched defect class.

Fix shape: read `.claude/skills/rptc-hygiene-scan/scan.sh` check 5's parser,
point it at the CURRENT README format (or better, at `backlog.mjs list --json`
so it stops parsing markdown at all), and keep the existing control.

## Shipped so far

- 2026-08-27  2026-08-27: rewritten — check 5 now consumes backlog.mjs list --json (one tool, one parse); signals are BODY TOMBSTONE (title-level completion claim on a live-status item; sub-section SHIPPED deliberately excluded after the first run flagged AI-1e's partial) and ARCHIVED TWIN (basename in complete/ while status live). Self-tested: planted both defect kinds, both flagged, clean after revert. Control caught a repo-path bug in the first draft.
