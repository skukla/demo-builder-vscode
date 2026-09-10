# Logging

Two output channels, and which one you write to is a decision about audience.

| Channel | Holds |
|---|---|
| **Demo Builder: User Logs** | what a user should see — a readable subset |
| **Demo Builder: Debug Logs** | the complete technical record — a superset |

Anything in User Logs is also in Debug Logs. The split exists so a user diagnosing
their own demo is not reading SDK traces, while a bug report still has everything.

## Three loggers

| | |
|---|---|
| `DebugLogger` (`getLogger()`) | the general one; writes to both channels by level |
| `StepLogger` (`getStepLogger()`) | long operations, driven by `config/logging.json` |
| `ErrorLogger` | errors, with status-bar integration |

`StepLogger`'s messages are **configuration, not string literals** — the templates
live in `config/logging.json`. A step's wording changes there, not in the code that
runs it.

## Never log a secret

Values pass through
[`@/core/validation`](../validation/README.md)'s redactor before being written. That
covers all five GitHub token prefixes, environment variables and file paths, in a
deliberate order.

This repository is public, and Debug Logs get pasted into issues.

## Reading a dump

The structured stdout/stderr block **above** a blank error carries the truth; the
error line itself is often empty. There is a catalog of benign noise and a
channel-to-feature map in
[debug-log-triage](../../../.claude/skills/debug-log-triage/SKILL.md).

## Conventions that bind this

The rules are in [the handbook](../../../docs/development/handbook.md). Secrets never reach a log. That rule is enforced twice — a hook rule blocks a secret-shaped write before it happens, and this module redacts before writing.
