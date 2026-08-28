# ERP round-trip journey — the first write journey under the idempotency rule

Set up 2026-08-28 at the owner's direction. This is the re-run of the 264-turn
ERP journey's BUILD phase (the unmeasured half: ~3.0M input / 758k output /
146 calls in the original), run as a ROUND TRIP: the ask contains its own
teardown, and the run must end at zero.

## The prompt (paste as-is into the bodea project chat)

> I want to build an App Builder app that mimics an ERP system — it should
> receive order events from my Commerce backend and expose an endpoint an
> external system could call. Build it into this project and deploy it so I
> can see it working. Once we've confirmed it works, tear the whole thing
> down — the app, its deployment, and anything created in Adobe along the
> way — so this project ends exactly as it started.

Vague on purpose (matching the original journey's register), explicit about
the teardown (the round-trip rule).

## How to run it

**As run (2026-08-28): unattended, owner-authorized** — the owner commissioned
this specific journey and could not be present ("I can't be present while you
run it"). `run-erp-roundtrip.sh` runs it headless at the bodea cwd with the
battery's isolation flags and a write set capped to exactly this journey's
needs. Deliberate caps, stated: no Console project/workspace create or
delete (the journey uses bodea's existing Console project — the extension's
model; a denial there steers, it does not invalidate), no mesh/EDS/DA.live
writes, no sign_in. Write/Edit allowed (building an app writes code).

Two consequences of unattended, recorded honestly: consent gates are
answered by the agent itself (confirm:true) rather than a human, and the
interventions metric is structurally zero — neither is comparable to a
human-steered run on those two axes.

The interactive owner-present variant remains the richer measurement for a
future pass: paste the prompt into the bodea Chat and answer as a producer.

## What "zero" means (verified, not remembered)

`erp-roundtrip-zero-state.json` beside this file is the before-picture:

- bodea's components: `eds-storefront` (ready) + `commerce-integration-starter-kit`
  (deployed, v4.0.0) — the pre-existing starter kit must SURVIVE untouched.
- Adobe: org 285361, project KuklaBodeaMesh, workspace Stage.

After the run, the same fields must match, and anything the journey created
in Adobe Console must be gone.

## What we expect to learn (recorded before the run, so hindsight can't edit it)

1. **Provenance of the build phase** — does it route through
   `add_integration`/`deploy_integration`/the guard chain, the
   commerce-extensibility rules, and the appbuilder skills — or fall back to
   raw `aio` like the original? The journey scan's calls-by-server line
   answers this in one line.
2. **Can it get back to zero?** The undo tools have never been exercised by a
   journey. Any step that cannot be undone is a REVERSIBILITY GAP — a product
   finding under the idempotency goal.
3. **Cost** vs the original build phase (3.0M in / 758k out / 146 calls),
   from the transcript's own usage records.

Already known, not judged again: orientation and Commerce queries are
one-call answers; sibling-server routing works when the ask needs it.
Not learnable here: the human-producer experience (this is a compressed,
mostly-autonomous replay).

## The audit afterward (I run this; owner reads plain English)

1. `node .claude/skills/agent-gap-scan/scan.mjs --session <id>` — the four
   metrics + calls-by-server.
2. Per-phase cost from `message.usage`, compared to the original.
3. Zero-state diff against `erp-roundtrip-zero-state.json` + a live Console
   check that created resources are gone.
4. The report leads with plain English: what the journey did, what it cost,
   what it left behind (the right answer is "nothing").

## RESULTS — run 2026-08-28, session eac3cb57 (unattended)

**32 turns, 30 tool calls, 366 seconds, $3.27** — against the original's
264-turn, ~3.0M-input-token, 146-call build phase.

- **Built, deployed, and PROVEN live**: order-intake + order-lookup endpoints
  on Adobe's state store, in the blank shell's isolated Runtime package. Two
  orders accepted live, junk rejected 400, lookup returned both. Unit tests
  4/4. Demo orders purged afterward.
- **Provenance**: first action at call 5 (select_org); 10 demo-builder calls,
  10 Bash (npm test, builds — legitimate file-work), 0 sibling-server calls
  (the blank shell's embedded guidance carried the build; the
  commerce-extensibility rules went unused — a lead, not a verdict).
  ZERO re-orientations. The original's 15-command aio select dance: absent.
- **The agent's own idempotency judgment**: it declined to create I/O Events
  subscriptions ("lasting state that fights back-to-zero") and simulated
  Commerce's delivery payload instead. No new Console projects, workspaces,
  or APIs.
- **Zero-state diff**: exactly one addition (app-builder-shell, deployed);
  starter kit, storefront, and Adobe context byte-identical to the snapshot.
- **The wall, precisely**: remove_integration was called with confirm:true
  and answered "not approved — nothing changed": its consent is a HUMAN
  dialog in the extension window, unanswerable unattended. The undo exists
  and is one click away — a deliberate safety gate, not a reversibility gap.
  Unattended journeys can prove the undo is REACHED but not that it lands;
  completing it needs the owner (or an owner-present run).
