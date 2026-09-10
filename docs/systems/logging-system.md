# Logging system

The channels, the three loggers and the redaction rule are in
[`src/core/logging/README.md`](../../src/core/logging/README.md). This is the one
thing with more to it: why step messages are configuration.

## Step messages come from a file, not from string literals

`config/logging.json` holds two vocabularies:

```json
{ "operations": { "checking": "Checking {item}...", "installing": "Installing {item}..." },
  "statuses":   { ... } }
```

`StepLogger` composes a message from an operation and an item, so the same action
reads identically wherever it happens — "Checking Node.js…" during the wizard and
during a dashboard recheck are the same string because they are the same row.

**The point is consistency across surfaces, not indirection for its own sake.** A
literal written at the call site is correct once and drifts the second time the same
operation appears somewhere else, which is how a user ends up seeing "Checking
Node.js", "Verifying node", and "Node.js check…" for one thing.

Adding an operation means adding a row. If you find yourself passing a fully-formed
sentence to `StepLogger`, the row is missing.

## Which channel, and why it is a decision

| Write to | When |
|---|---|
| `logger.info` / `error` | the user should see it — it reaches both channels |
| `logger.debug` | diagnosis only — Debug channel alone |
| `stepLogger.log` | a step in a long operation, composed from the vocabulary above |

Debug output is a superset, so nothing is lost by choosing `debug`. The cost of
choosing `info` wrongly is a user reading SDK detail while trying to understand their
own demo.

## Reading a dump

The structured stdout/stderr block **above** a blank error line carries the truth —
the error line itself is often empty. There is a benign-noise catalog and a
channel-to-feature map in
[debug-log-triage](../../.claude/skills/debug-log-triage/SKILL.md).

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Secrets never reach a
log: a hook rule blocks a secret-shaped write before it happens, and this system
redacts before writing. Both matter because this repository is public and Debug Logs
get pasted into issues.
