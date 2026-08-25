# Human copy for the agent consent dialog — SHIPPED 2026-08-25

**Done in `201ebe086`, and smaller than filed.** The item scoped 60 write tools
because every one of them could raise a dialog. Re-aiming the gate at operations
that actually warrant interrupting took that to **15**, and all 15 are written.

What shipped: `agentAlertCopy` (authored `action` + `consequence` per tool), the
derived-copy transforms removed, the gate keyed on the operation rather than the
agent's `confirm`, and `docs/systems/agent-alerts.md` recording all five alert
surfaces and the standing rule — alert text is authored, never transformed.

`worksheet.md` is kept as the audit trail: it holds all 60 rows with the text each
tool showed BEFORE, which is what a future reader needs to see why the derived
approach was abandoned. It is not a to-do list; the 45 tools not in the dialog set
show no dialog at all.

The original scope, for the record:

## Provenance

2026-08-24/25. The consent dialog began as a schema dump:

```
Demo Builder — an AI agent requests: Start demo. Allow it?
confirmName: bodea
```

It was improved in stages during that session — the action moved to the title,
field names became labels, acronyms stopped being sentence-cased, and the tool's
own DESCRIPTION replaced the boilerplate detail line. Each step was a real
improvement and each exposed the next problem, because they were all mechanical
transforms over a string that was never written for this audience:

```
Demo Builder: Open URL?
Open one of the CURRENT project's URLs in the browser.
Name: bodea
Target: liveSite
```

`CURRENT` is agent emphasis, and it reads as shouting. `liveSite` is a raw enum
value. The sentence says "one of the URLs" while the dialog directly below
already says WHICH one. None of that is fixable by another regex — it is the
symptom of **one string serving two audiences**.

**Decision (producer, 2026-08-25): stop transforming, start writing.** Read all
60 and author a human sentence for each.

## What was already measured — do not re-derive

Counted across the 60 non-read tools, whose descriptions are what the dialog shows:

| Property | Count | Note |
|---|---|---|
| First sentence carries a parenthetical | 29 / 60 | Mixed: `(irreversible)` is essential, `(select_org first)` is agent-only |
| First sentence SHOUTS a word | 23 / 60 | Mixed: `DA`(11), `SDK`, `CLI`, `VS`, `AGENTS` must stay; `CURRENT`, `SELECTED`, `ONE`, `OPTIONAL`, `EXACTLY` are emphasis |
| Argument values shown raw | — | `Target: liveSite`; keys are humanised, values are not |

The mixture in both rows is the point: a blanket rule breaks the important half.
Stripping every parenthetical deletes `(irreversible)` from delete dialogs;
lowercasing every shouted word turns DA.live into da.live. Two narrow rules ship
already (agent-only asides, acronym casing) and are worth keeping — they just
cannot reach the rest.

## Goal / Scope

Each write tool gains a **human consent sentence**, separate from its agent
description. One line, plain, addressed to a producer deciding yes or no.

Guidance for the writing itself:

- **Say what will change, not what the tool is.** "Publishes your storefront to
  the live site" beats "Regenerate and republish the EDS storefront config.json".
- **Name the blast radius when it is wide.** Irreversible, affects a shared site,
  costs money, touches another person's access — say so. This is the half a
  mechanical rule keeps getting wrong.
- **Drop cross-references.** `get_project_urls`, `select_org first` mean nothing
  to the reader and they cannot act on them.
- **No emphasis caps, no field names, no protocol tokens.**
- **Assume the title already said the verb.** The title renders "Demo Builder:
  Open URL?", so the sentence adds the consequence, not a restatement.

`worksheet.md` beside this file has all 60 with the title and the sentence shown
today, and an empty column to fill.

**In scope:** the sentence; humanising argument VALUES the way keys already are
(`liveSite` → "Live site"), which is a small mechanical fix worth doing alongside
since it is per-value and unambiguous.

**Out of scope:** the agent-facing `description`. It stays exactly as it is —
it is tuned for routing and cross-references and must not be softened. This item
ADDS a field; it changes no existing one.

## Constraints

- **Do not regress `(irreversible)`.** A test already pins that agent-only asides
  are stripped while that word survives. Any new copy path keeps that property.
- **Fall back, never blank.** A tool with no human sentence must still show its
  description, exactly as today. Adding the field must not make an unwritten tool
  worse than an unwritten tool is now.
- **One place.** The sentence belongs with the tool definition, not in a side map
  that drifts — the same reasoning that keeps `humanize()` shared between the chat
  line and the notification. `ToolDescriptor` already carries `description` and
  `confirm`; a sibling field is the natural home, with the directly-registered
  tools (`storefrontTools`, `siteTools`, …) taking the same key in their
  registration object.
- **Read tools need nothing.** They raise no dialog.

## Execution plan

1. Add the optional field to the descriptor type and the direct registrations,
   with the consent gate preferring it and falling back to today's behaviour.
   Ship this with ONE tool written, so the seam is proven before the writing.
2. Fill `worksheet.md` — the actual work, and the part that cannot be automated.
3. Move the filled column into the code.
4. Humanise argument values alongside (identifier-shaped values only:
   `/^[a-z]+([A-Z][a-z]+)+$/` or snake_case, so project names, paths and URLs are
   left alone).
5. A coverage test: every tool whose name is not read-shaped has a human sentence,
   with an explicit allowlist for any deliberately left on the fallback.

## Kickoff prompt

```
/rptc:feat "Write human consent copy for all 60 write tools. Read
.rptc/backlog/consent-dialog-copy/overview.md first — it records why mechanical
transforms cannot finish this job, and what has already been measured so it is not
re-derived. worksheet.md holds the 60 rows to fill. Add the field and prove the
seam with one tool before doing the writing."
```
