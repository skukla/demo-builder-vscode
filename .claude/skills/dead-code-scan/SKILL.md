---
name: dead-code-scan
description: Find dead code — unused exports, unimported files, self-declared abandonment markers (deprecated/legacy/superseded stubs), and CLOSED REFERENCE LOOPS (code referenced only by other dead code, which ts-prune cannot see). Use when reviewing for cruft, right after superseding an implementation, or when asked "is this still used?" / "can I delete this?". Serves the "no soft deprecation" rule — obsolete code gets deleted, not stubbed.
---

# Dead-Code Scan

Detect code that nothing reaches: exports no one imports, symbols left over after a
supersession, and comments that admit the code is obsolete. This repo's rule is **no soft
deprecation** — when something is obsolete you DELETE it, you never leave a `(Deprecated)`
stub or accepted-but-ignored path. This scan finds those stubs so they can go. It does NOT
overlap `/sop-scan` (God files, oversized components, complexity) — cross-reference that.

## When to use
- Reviewing the codebase for cruft, or before a cleanup pass.
- Right after superseding an implementation — hunt the leftovers of the old one.
- Answering "is this export still used?" / "can I delete this file safely?".

## When NOT to use
- File-size / complexity / mixed-pattern smells — that is `/sop-scan`.
- A symbol you already know is a live entry point or DI/config registration.

## Procedure

1. **Shortlist** the three mechanical signals:
   ```bash
   bash .claude/skills/dead-code-scan/scan.sh src
   ```
   Section 1 = ts-prune unused exports (filtered to `src/`). Section 2 = abandonment
   markers. Section 3 = doc drift. Treat 1 and 2 as candidates, not verdicts;
   section 3 is reliable (see below).

   **Know which half you are in.** This skill covers two different problems with
   very different reliability:

   | Question | Mechanizable? | Why |
   |---|---|---|
   | Does this thing the docs NAME still exist? | **Yes** — section 3 | one-way existence check; nothing can fake a definition into being |
   | Does anything REACH this code? | **No** | dead code references dead code, which defeats any pattern match |

   Trust section 3's output. Treat everything about reachability as a lead requiring
   the protocol below.

2. **Triage ts-prune FALSE POSITIVES** — these are live despite showing "unused":
   - **Entry points** — `extension.ts`, `mcp-server.ts` (VS Code / MCP call them).
   - **Dynamic-import / DI-registered / config-driven-registered** symbols — referenced
     by string id or wired through a registry, so no static import exists.
   - **`(used in module)`** — referenced internally, never imported elsewhere. The fix is
     to DROP the `export` keyword (make it local), not delete the symbol.

3. **Confirm before deleting** a genuine candidate:
   - `grep -rn '<SymbolName>' src` — verify zero real references (mind re-exports).
   - `git log -p -S '<SymbolName>' -- <file>` — see why it landed; a recent supersession
     confirms it is a leftover.
   - The repo is PUBLIC — never paste secrets/tokens into notes or commits.

4. **Delete outright** — remove the symbol/file and its dead imports, and any test that
   only covered it. No `(Deprecated)` stub, no commented-out block.

## Closed reference loops — the class ts-prune cannot see

`ts-prune` answers "does anything import this?". It cannot answer "does anything
*reach* this?", so a group of dead symbols that reference each other reports as fully
used. Every one of these shipped undetected until a human went looking (2026-08-05):

| What it looked like | What it was |
|---|---|
| `handleCreateApiMesh` — 6 registration sites | A message no webview ever sent |
| `api-mesh-progress` | A sender whose listener did not exist |
| `cloudGrouping` | A field plumbed through 5 files to a prop nobody read |
| `PROGRESS_CALLBACK_TYPES` | A config whose sole member was the dead message above |

**A grep-based detector does not work here — verified, not assumed.** One was written
and regression-tested against the tree before the deletion: it missed
`create-api-mesh`, because `progressCallbackConfig.ts` referenced the key and looked
like a sender. It was dead too. The loop supplies the references that defeat the
check, which is the definition of the shape. Do not re-attempt this as a script
without real reachability analysis; the previous attempt also produced 11 unverified
candidates.

### The manual check that does work

**Step 0 — run a CONTROL first. Non-negotiable.** Pick 3-4 symbols you have
personally watched work, and run the identical check on them. If it does not find
their callers, your origin list is incomplete and every "dead" verdict is noise.

This is the step that decides whether the pass is worth anything. On 2026-08-05 the
first run flagged `check-api-mesh` and `deploy-api-mesh` as dead; both are live,
sent from `features/ai/server/*Descriptors.ts` — an origin the check did not know
about. The control caught it. Skipping it would have produced a list two-thirds
wrong, delivered with full confidence.

```bash
# CONTROL — expect a hit for every one of these:
for k in <symbols-you-know-are-live>; do ...same check...; done
```

**The origin list is PER MECHANISM, not fixed.** Derive it before you start by
asking "what could legitimately invoke this kind of thing?" For webview messages in
this repo that is: a `ui/` sender, an MCP descriptor, a `package.json` command. For
a VS Code command it is `registerCommand` + the `contributes` entry. For a config
id it is whatever loads the config. Get this list wrong and the control fails —
which is the point of the control.

Then pick a suspected symbol and ask **who ORIGINATES a call**, never "who mentions it":

```bash
KEY='create-api-mesh'          # or a field name, or a message type
grep -rn "$KEY" src | grep -viE 'Handlers\.ts|Registry\.ts|messages\.ts|webviewCommunicationManager'
```

Then confirm each surviving reference is a real ORIGIN, not more plumbing:

1. **A UI sender** — `postMessage('$KEY')` / `request('$KEY')` under any `ui/`.
2. **An MCP descriptor** — `features/ai/server/*Descriptors.ts` (these are real
   senders and are easy to mistake for docs).
3. **A command** — a `package.json` `contributes.commands` entry.
4. **Its own docblock** — NOT a reference. This is what most often keeps a dead
   symbol looking alive.

Zero origins ⇒ dead, however many files mention it.

### Where this does NOT apply

- **Iterated consumption.** Config entries are consumed by looping, not by name, and
  their references live in OTHER CONFIG. "No reference by name" is normal there. A
  2026-08-05 pass flagged `index-product-teaser-sku-accs` as orphaned; it is
  referenced by `demo-packages.json` and iterated by `contentPatchRegistry`. Only
  apply this to NAMED dispatch whose references live in code.
- **Surfaces with a runtime feedback loop.** Measured the same day: webview message
  handlers had 11 orphans, while VS Code commands, `ErrorCode` members and config ids
  had none. The predictor is not "string-keyed dispatch" — it is whether registering
  something unused produces any symptom. VS Code errors on an unregistered command;
  an unsent webview handler is silent forever. **Spend the effort where the silence
  is.**

### Signals worth suspecting

- A registry row whose value is another registry's lookup (`'x': otherMap['x']`) —
  registration referencing registration.
- A `sendMessage('x')` with no matching listener, or a listener with no sender. Check
  BOTH directions; a dead pair keeps each other alive.
- A typed field that only ever appears in assignments and type declarations, never in
  a condition, a render, or an argument. Grep the field and read whether any hit
  actually *consumes* the value.
- A config collection with exactly one member — deleting that member may kill the
  collection, its accessor, and its call site.

**Expect the cascade.** Removing one of these usually kills several: the 2026-08-05
deletion took 3 source files, 4 test files, and 6 registration sites, none of which
the original scan named.

## Heuristics
- An abandonment marker (`// deprecated`, `legacyFoo`) is itself the bug: delete the code
  it labels, don't keep the label.
- Un-export before delete: an internal-only export narrows to local scope cleanly.
- One real reference (even a test-only one that tests nothing else) means NOT dead — decide
  whether the reference itself should go.

## Output format
```
## Dead-code candidates
### Unused exports (confirmed)
- src/features/x/foo.ts:12 — bar  (delete: 0 refs, superseded by baz in <commit>)
- src/core/util/qux.ts:3 — helper  (used in module → un-export, keep)
### Abandonment markers
- src/features/y/old.ts:40 — "// legacy path, no longer used" → delete block
### False positives (live — do not touch)
- src/extension.ts:8 — activate  (entry point)
```

## Worked example (this repo)
After the keyed App Builder model superseded the slice-1 singular one, ts-prune surfaced the
old singular exports (`addAppComponent`, `DeployAppCommand`) as unused while the marker grep
caught the "superseded" comments left beside them. Triage confirmed no live callers; the
resolution under "no soft deprecation" is to delete the singular symbols and their tests, not
leave them as ignored stubs — the scan re-run then shows them gone.
