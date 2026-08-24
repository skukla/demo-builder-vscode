# Phase 3 — Enforcement

**Status:** CLOSED 2026-08-17. Written at closeout, not at planning time — the phase ran as
three separate pieces of work and this file records what they added up to.

The phase exists because phase 2 had to pay for a convention nobody enforced: "keep JSON
small" was prose in a doc for a year, and one tool drifted to 111,748 bytes. The question
this phase answers is not "what should tools do" but "what stops the answer rotting again".

## What shipped

| Guard | Where | What it catches |
|---|---|---|
| Response-size ceilings | `RESPONSE_CEILINGS` + `expectWithinCeiling` (`responseSize.test.ts`) | A tool whose payload grows past its measured budget. Asserts its OWN coverage in both directions, so a new tool is either covered or explicitly classified |
| Component-catalog pin | `actionDescriptors.test.ts` | A catalog edit that silently changes what an agent can select |
| **Response envelope** | `responseEnvelope.test.ts` (new, this session) | A tool answering in a shape the agent cannot read |

## The envelope guard, and the thing it found

Two halves, because the surface has two shapes and one check would either miss a half or
invoke 103 tools against live services:

- **46 descriptor rows** — all wrapped by one line in `registerDescriptorTools`, so it is
  checked at RUNTIME by driving a row through the real registrar. Covers the two early
  returns as well as the normal path: a confirm refusal and a preflight answer never reach
  a handler, and an early return is exactly where a hand-written response skips a wrapper.
- **57 bespoke tools** — each returns its own result and there is no shared wrapper to
  test, so they are checked at the SOURCE: a module registering a tool must build its
  answer with a shared builder. Weaker, and the file says so — it proves a builder is
  imported, not that every branch uses it. The failure it guards is a NEW tool inventing
  its own shape, and that is what an absent import looks like.

**The check failed on its first run, twice, and both failures were real.**

1. **Ten of the 23 registrar modules hand-rolled the envelope** — the exact duplication
   `mcpToolResult.ts` was extracted to remove in July ("pasted into EIGHT tool files").
   It had grown back to ten. `adobeResourceTools.ts` had a byte-identical copy of the
   helper under the same name.
2. **The convention as written was wrong.** It said "every tool answers JSON-as-text".
   Four bespoke tools and the shared descriptor registrar answer refusals and errors as
   bare PROSE, which `JSON.parse` rejects. That is not drift — a refusal an agent reads is
   the right shape, and it predates every tool here.

So the fix was not to force JSON. `mcpToolResult` now exports two builders — `asText`
(serialize this value) and `asRawText` (this string IS the text) — and all 20 modules go
through one of them. The envelope is the invariant; JSON is not. Docs corrected at
`docs/systems/mcp-server.md` §10.

**A convention nobody had stated correctly is not a convention.** Writing the test was
what established what the surface actually does, and that is the general lesson: the guard
came second, the discovery came first.

## The guard's FIRST version was wrong in the same way it was written to catch

It scanned `src/features/ai/server/` and claimed to cover "both halves of the surface". Ten
of the 57 bespoke tools are `registerProjectTools` in `src/mcp-server.ts` — the vscode-free
half, registered into the same server, indistinguishable to an agent. All ten hand-rolled
the envelope. The suite passed, and **its own control passed with it, because the control
shared the wrong scope** — `registrars.length > 10` is satisfied by the modules it did find.

This is the repo's own recorded failure mode (`CLAUDE.md`: "A control proves the tool works,
not that you aimed it right"), reproduced inside the test written to prevent drift. Two
review agents found it independently on the first pass, which is the argument for running
them: the author's scope error is invisible to the author.

Fixed by naming the second location in a LIST (`EXTRA_REGISTRAR_FILES`) rather than widening
a glob, plus a second control asserting the scan reaches outside the directory. A directory
is a guess about where the surface lives; here the guess was wrong.

## Falsified, not assumed

Every assertion was broken deliberately and confirmed to fail:

- Made the confirm refusal return a bare object → `wraps a CONFIRM REFUSAL` failed.
- Added a registrar module hand-rolling the envelope → both source-level checks failed and
  named the file.
- Restored one `src/mcp-server.ts` tool to a hand-rolled envelope → the inline check failed
  and named `src/mcp-server.ts`, proving the widened scan actually reads there.
- Swapped `asRawText(shape(…))` to `asText(shape(…))` in the registrar — the likeliest
  regression of this refactor, double-encoding every descriptor response → caught. Before
  the review it was NOT: the descriptor tests asserted structure only, so a builder swap
  passed. One assertion on the exact text closed it.

## What is NOT enforced, and is not pretended to be

The overview's "11 of 24 documented conventions are prose only" was measured before this
phase and is now 10. The remaining ones are mostly judgement calls a test cannot make
("keep the description terse", "say WHEN to use it"). Two that COULD be enforced and are
not, left deliberately rather than forgotten:

- **No writes hiding in reads.** The rule is real and has bitten (`argDefaults` exists
  because `check_github_app` fired a repo write on a 404). A guard would have to know
  which services mutate; nothing declares that today.
- **Destructive ops are confirm-gated.** 19 tools mutate state ungated against a
  documented rule — recorded in the overview as a shipped defect belonging to whoever owns
  that code, not to this program. A test pinning the current set would freeze the defect
  rather than catch it.
