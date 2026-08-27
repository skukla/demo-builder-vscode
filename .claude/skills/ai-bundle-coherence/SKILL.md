---
name: ai-bundle-coherence
description: Check that real projects' AI bundles match their shape — delivered skill sets vs project composition, bundle sources that actually exist, and .mcp.json/installed-package agreement. The live half of tests/templates/ai-bundle-coherence.test.ts. Use at release cuts, after changing skillsWriter/aiToolingGate/ai-defaults, or when a project's agent seems to have the wrong skills.
---

# AI-bundle coherence scan

```bash
node .claude/skills/ai-bundle-coherence/scan.mjs               # every real project
node .claude/skills/ai-bundle-coherence/scan.mjs --self-test   # prove it can fail
```

Exit 0 when every project is coherent; 1 with findings; the self-test plants
three defects in a temp project and fails loudly if any goes undetected.

## The two halves, and why they are split

**Static** (`tests/templates/ai-bundle-coherence.test.ts`, every commit):
cross-file agreements — skill→tool dependency ids exist in ai-defaults, the
writer's bundle prefixes match the modal's label keys, every user-facing name
carries structural provenance (`aiSurfaceNames.ts`).

**Live** (this scan, on demand): what a unit test structurally cannot see —
whether the delivered files on a REAL project match its shape, whether the
bundle copy SOURCES exist in the real installed package (the AI-1m failure:
a source path that never existed, ENOENT-skipped silently on every project
ever created), and whether every applicable ai-defaults entry has both its
`.mcp.json` server and its installed package.

## A husk is not a delivery

The ADR-013 reconcile removes files on per-file proof and LEAVES the empty
directories (a recursive delete has no proof). So `appbuilder-architect/`
existing means nothing; it counting requires a file somewhere beneath it —
recursively, because kits ship nested `references/` dirs that survive as empty
husks too. Both mistakes were made and caught on this scan's first two real
runs; the self-test pins the distinction.

## Shape predicates are restated, deliberately

`hasEds` / `buildsApps` mirror `aiToolingGate.ts` (three lines each). This scan
is plain node and cannot import TS. If the gate changes, the static suite pins
the writer side; update the mirrors here.
