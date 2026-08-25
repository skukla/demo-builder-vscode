# Agent alerts — the definitive list

Every message Demo Builder shows a human because an AI agent is doing something.
Five surfaces, and nothing else may be added without appearing here.

Written 2026-08-25, after four passes of DERIVING this text from tool names and
agent-facing descriptions each produced something a producer should not have been
shown. The rule that came out of it: **alert text is authored, never transformed.**

## The five surfaces

| # | Surface | When | Text comes from |
|---|---|---|---|
| 1 | Modal consent dialog | Before a call that cannot be undone or reaches beyond this machine | `agentAlertCopy` — authored |
| 2 | Progress notification (VS Code) | While any tool that writes runs | `toolNarration` — authored |
| 3 | Chat progress line | While any tool that writes runs, plus each phase | `toolNarration` + the operation's own phase strings |
| 4 | Status bar | On success | `toolNarration` — authored |
| 5 | Warning toast | On failure | `toolNarration` + the error |

**All five are authored now.** An earlier version of this page said surfaces 2–5
merely name an operation the user already asked for, so a humanised tool name was
the right content. A narration audit on 2026-08-25 disproved it: deriving the
text from `deploy_mesh` produced "Deploy mesh…", a button label sitting above the
status lines beneath it, and about ten tools got wording that was not English —
"Set project pinned…", "Set setting…" (a tool that changes no setting), and
"Republish…", which never said republish WHAT.

So the rule at the top of this page applies to every surface, not just the
question. Phrases live in `toolNarration.ts`, one per tool including reads, in
the progressive form, written from each tool's DESCRIPTION rather than its name.
There is no fallback: a tool without a phrase says nothing.

## 1. The consent dialog

**Fires when both are true:** the agent passed `confirm: true`, AND the tool is in
`AGENT_ALERT_COPY`.

Membership is the copy table itself, so a dialog with no authored words is not
expressible. Pinned by a test.

**The criterion for membership:** the operation cannot be undone by another call,
or it reaches beyond this machine — a live site, a shared library, a shared Adobe
project, another person's access.

Not "is it a write". Not "did the agent say confirm". Both of those were tried:
keying on `confirm` alone put a modal on `open_url` (opens a browser tab) while
`remove_integration` and `reset_datapack` raised nothing.

### The list

Deleting things
- `delete_project` · `delete_github_repo` · `delete_adobe_project` · `delete_page`
- `cleanup_dalive_site` · `remove_block_from_library` · `remove_integration`

Replacing or wiping
- `reset_eds_project` · `reset_datapack` · `migrate_storefront_name`

Reaching other people
- `set_site_admin` · `republish` · `sync_content`
- `start_datapack_import` · `start_datapack_export`

### Deliberately NOT on it

`open_url`, `open_view`, `sign_in`, `create_project`, `apply_updates`,
`promote_block_to_library`, `repair_site_configuration`.

All of these raised a dialog before 2026-08-25. They are recoverable, additive, or
trivially reversible, and a prompt on a cheap mutation trains people to click
Allow without reading — which costs more than it saves.

## Writing the copy

`action` completes "Demo Builder: ___?" — a verb phrase, no full stop.
`consequence` is ONE sentence saying what changes.

- Say what changes, not what the tool is. The reader already wants the thing;
  they are deciding whether they want it NOW, to THIS.
- Name the blast radius in plain words. "This can't be undone", not
  "(irreversible)".
- No tool names, no field names, no protocol tokens, no emphasis capitals.
- Assume the title said the verb. The sentence adds the consequence.

## What NOT to do, and why

- **Do not show the agent-facing `description`.** It is tuned for routing and
  cross-references (`select_org first`, `Requires confirm:true`) and reads as
  shouting and jargon to a human. It is still passed to the gate so the signature
  is stable; it is deliberately not rendered.
- **Do not transform text into copy.** Every regex tried here split a set down the
  middle: stripping parentheticals deletes `(irreversible)` along with
  `(select_org first)`; lowercasing shouted words turns DA.live into da.live.
- **Do not add a sixth surface** without adding it to this file first.
