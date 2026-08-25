# Step 06 — Consent where the user is actually looking

**Ships:** the approval prompt appears in the surface the producer is watching.
**Depends on:** step 05 (which settles how a run is identified — the same
mechanism may identify the connection to ask).

## The problem

The consent dialog opens in the VS Code window. The producer is looking at the
TERMINAL. A blocking prompt in a window nobody is watching is worse than no
prompt: the agent hangs until it happens to be noticed.

## MEASURED 2026-08-25 — the answer, and what it changed

Full record: `.rptc/research/consent-in-the-chat/research.md`.

- **Claude Code declares `elicitation: { form: {} }`** and genuinely handles the
  request — it is answered, not ignored.
- **Headless it answers in ~5ms with `action: "cancel"`.** No hang, no throw. The
  producer sees no prompt; the client generates that answer, not a person.
- **A server cannot tell "nobody was there" from "the user said no".** Both are
  `cancel`, and the payload carries nothing that separates them.

That last point killed the first design, which branched on `decline` vs `cancel`.
The three actions exist in the spec, but only `cancel` has ever been observed, so
branching on the difference was a guess dressed as a fact — and both ways of
being wrong are bad (a chat decline gets asked again in a modal; a headless run
waits on a dialog nobody is watching).

**The design that survives: anything that is not an explicit `accept` is a
refusal.** Headless therefore refuses every destructive operation, which is
correct by default — `demoBuilder.ai.requireAgentConsent` already exists as the
deliberate unattended escape hatch. Nothing hangs, and nobody is asked twice. The
modal stays the path for clients that declare NO elicitation, rather than being a
second chance after a chat prompt.

**Still untested:** whether an interactive session renders a usable prompt. One
human minute settles it; the command is in the research writeup.

## Start with the measurement, not the design

**One fact decides this step, and it is unverified.** The SDK in this repo
exposes `server.elicitInput()` (`server/index.d.ts:158`), which asks the CLIENT
for user input. Whether **Claude Code declares the `elicitation` capability** is
not known.

Log the client capabilities the server receives at `initialize` and read them.
That is the first commit of this step, and it is a few lines. Do not design
around either answer before it lands — both branches below are real, and picking
one early wastes the branch that turns out to be right.

- **It supports elicitation** → ask in the chat, keep the modal as the FLOOR for
  clients that do not. Not one or the other: a consent gate that silently stops
  working is the worst available outcome.
- **It does not** → the modal stays, and the step becomes the session-grant work
  below plus making the modal easier to notice.

**The fork worth naming.** If neither branch lands well — the modal stays hard to
notice and the client will not take an elicitation — then the answer is not a
third variation of this step. It is
[`own-the-chat-surface`](../../backlog/2026-08-24-own-the-chat-surface.md), which
already carries the design: render Claude Code's own stream in our UI, with
permission requests as cards. That item is deliberately NOT a step here — it is a
much larger piece of work with its own argument, and it should be chosen
deliberately rather than arrived at by a consent step growing. Record what this
step measures either way; it is the evidence that item would need.

## Session grants — designed in step 01b, build here

Not a blanket "allow everything this session": `demoBuilder.ai.requireAgentConsent`
already exists as the headless escape hatch, and a second easier one gets used by
accident.

Offer **"don't ask again this session"** per tool, and ONLY where the consequence
can be undone:

| Tool | Offer | Why |
|---|---|---|
| `republish`, `sync_content` | yes | repeatable, recoverable, and they fire repeatedly in one flow |
| `delete_*`, `reset_*` | never | their own `consequence` line says "can't be undone" |

The distinction is already authored — it is in the consequence text of the 15
entries — so this is another field on `AGENT_ALERT_COPY`, not a new
classification. Grants die with the session. The target line matters MORE here:
"allow republish for this session" is a broader promise than "republish bodea",
and the dialog has to make clear which is being given.

## Tests

- The capability probe reports what the client actually sent (assert on the
  logged value, not on a constant).
- With elicitation available, the request goes to the client; with it absent,
  the modal opens. Both by execution.
- A session grant suppresses the SECOND prompt for that tool and not for any
  other tool.
- A grant is refused for a tool whose consequence is irreversible — asserted
  against the authored copy, so adding an irreversible tool cannot opt in by
  accident.

## Done when

The prompt reaches the producer where they are working, or it demonstrably falls
back; grants exist only where they are safe; `gate` clean.
