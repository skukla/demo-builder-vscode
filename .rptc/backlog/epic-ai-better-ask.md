---
id: AI-3
kind: epic
area: ai
needs: []
value: med
status: active
---
# Helping a producer write a better ask

Evaluation Mode's producer half: simulate a prompt, see what it would do and what
it would cost, refine, and keep the version that worked.

**The metric is TOKENS, not dollars** (owner, 2026-08-26). Dollars measure our
cost; tokens measure the producer's remaining ability to work, and a quota that
runs out costs them the afternoon.

**And wording is not the lever.** A probe spent 33,819 tokens answering "pong",
of which the prompt was 10 — context is ~99% of every run. What costs tokens is
ROUND TRIPS, because each one re-reads the whole context. So the advice is
"remove a lookup", not "write less".

## Children

| | |
|---|---|
| `AI-3a` | Prompt workbench (plan: `evaluation-mode/step-11-two-tools.md`) |
| `AI-3b` | Suggestions written by Claude — blocked on the held-out set |
| `AI-3c` | OpenTelemetry — durable trace storage |

## Done when

A producer can watch a number fall as they refine, and go back to the version
that worked.
