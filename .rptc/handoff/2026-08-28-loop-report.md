# Overnight loop report — 2026-08-28 (post-beta.145 night)

Branch: `loop/2026-08-28-journeys-battery` (all work committed there, pushed).
Rails held: no cloud writes, gate-conditional commits, scans where triggered.

## The takeaway

Two backlog items shipped outright (the journey metrics, and the round-trip
optimisation item whose last open question was answered by measurement), one
agent-confusion bug the owner caught was fixed and verified live, the design
axis of the AI-surface question moved two steps, and the tests-tree
duplication census dropped from 167 clones to 159 with two mechanical
extractions — 50 tests re-run byte-identical around them. Two decisions are
queued for the owner; nothing is blocked on anything else.

## Shipped (on the branch, awaiting merge)

1. **`get_auth_status` can no longer be misread as "GitHub signed out"**
   (the owner's correction, twice bitten). No stored token now falls back to
   a silent VS Code session read — no prompt, no adoption, no storage — and
   reports where the credential lives; when neither source has one, the
   response says plainly that VS Code manages GitHub auth and adopts it on
   use. Live-verified against the dev host. A memory pins the lesson.

2. **The four journey metrics** (backlog: "Journeys, not prompts…", now
   SHIPPED). Every journey read opens with: first action, re-orientations,
   Bash moments by arc third, interventions. Reference numbers from the
   264-turn ERP session: first action at call 6, 4 re-orientations, 94 Bash
   calls spread evenly — a sustained capability gap, not a discovery one.
   Both of the item's open questions are answered: journeys are observational
   (not re-runnable), and the held-out set is future real journeys — every
   post-fix session in the corpus is a battery run, so real journeys will
   accrue passively via the new agent trace.

3. **The orientation trio is dead — measured** (backlog: "Agent round-trip
   optimisation", now SHIPPED). 4 prompts × 3 repeats on this multi-project
   machine: 12/12 hits, `get_current_project` in zero runs, no run called
   even two of the three orientation tools. Nothing left to consolidate; all
   four of the item's candidates are resolved.

4. **Token-first theming for the whole theme** (AI-surface design axis,
   step 1). The design skills taught the edit-tokens-not-literals rule for
   type only; a real storefront defines ~114 tokens (color, type, spacing,
   shape, grid). Both skills now teach the full rule with read-the-file-first,
   plus the reset lifecycle stated plainly (step 2's interim half): reset
   returns the repo to template, so every CSS edit dies by design — nothing
   warned the person asking. Bundle version bumped (v30) so existing projects
   refresh; the version-pin test caught up at close-out.

5. **Tests-tree dedup, two mechanical clusters** (backlog: tests-tree dedup).
   The extension-activation pair and the AddIntegrationFlowModal pair each
   carried a byte-identical preamble; both now share a testUtils that owns
   the mocks and the SUT import. 14 + 36 tests before and after, none edited.
   Census: 167 clones / 2.59% → 159 / 2.45%.

## Handed off / triaged, not forced

- **Three test-suite families are variants, not copies** — the reset-service
  five, the update-checker pair (its fixtures differ *semantically*), and the
  start/stop-demo four. Each needs per-family design; forcing a shared
  preamble unattended risked changing what five suites actually test. Triage
  recorded on the dedup item; the next pass starts from it.
- **The shared-catalog item** is at its supervised edge: the re-measure needs
  the Data Installer URL, which is machine-scoped, deliberately unbundled,
  and absent from the isolated dev-host profile — and the real window's
  server is unreachable while the dev host holds the shared socket.
- **Engine-aware AI launch** stays blocked on the prerequisites reframe (its
  recorded dependency) — not picked up.

## Corrected

- The full-suite close-out caught one miss of my own: the bundle version
  bump left its pin test behind (my scoped gate didn't cover tests/core).
  Fixed on the branch.

## Environment facts

- Adobe session ~13h at loop start, DA.live signed in; GitHub managed by
  VS Code (see shipped item 1 — the tool now says so itself).
- The dev host serves the loop branch build; the shared socket belongs to it
  until the next host starts.

## Your decisions (the walkthrough queue, in order)

1. **Merge the loop branch?** Everything above is on it, gated green
   (full suite 1,171 suites / 15,179 tests after the pin fix).
2. **Theme edits vs reset** (AI-surface design axis, step 2): should theme
   edits survive a project reset? My recommendation: no — reset's contract
   is "back to template"; durability belongs upstream in the brand source.
   Deciding this unblocks steps 3–4 (the design skill with a stopping rule).
3. **Shared-catalog differentiation** (the Bodea catalogs item): approve the
   drafted path 1 — untick three categories on ServerSavvy in one instance's
   Admin, prove the visibility story, then request the pack change upstream.
