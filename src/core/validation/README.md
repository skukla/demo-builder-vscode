# Validation

Two families that look similar and behave differently. Getting them the wrong way
round is the mistake this file exists to prevent.

| | Where | On bad input |
|---|---|---|
| **Security** — `validators/` | before a shell command, a file path, an HTTP call | **throws** |
| **Field** — `fieldValidation.ts` | a form the user is typing in | **returns** a `FieldValidation` |

A security validator throws because there is no sensible way to continue: the value
was about to be interpolated into a command. A field validator returns because the
user is mid-keystroke and an exception is not a UI.

## Whitelist, never blacklist

Every security validator tests what is ALLOWED (`/^[a-zA-Z0-9_-]+$/`), not what is
forbidden. A blacklist has to enumerate every dangerous character and is wrong the
first time one is missed. This is not a preference — do not add a validator that
works the other way.

## What the URL validator blocks, and why it is more than you would guess

`URLValidator.ts` rejects far more than malformed URLs, because a URL that reaches a
request is an SSRF vector:

- **Loopback and unspecified** — `localhost`, `127.0.0.0/8`, `0.0.0.0`, and the IPv6
  spellings `[::1]` and `[::]`. Note the brackets: `URL.hostname` keeps them for IPv6,
  so a check written against a bare `::1` silently matches nothing.
- **IPv4-mapped IPv6** — `[::ffff:127.0.0.1]` and `[::ffff:0.0.0.0]`. These resolve to
  loopback while looking like neither, and are the bypass a naive check misses.
- **Private ranges** — `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`
- **Link-local, including cloud metadata** — `169.254.0.0/16`, which covers
  `169.254.169.254`. That address returns instance credentials on every major cloud,
  and it is the one people forget.
- **Non-network protocols** — `javascript:`, `file:`, `data:`

## Redaction order is load-bearing

`SensitiveDataRedactor.ts` applies patterns in sequence, and **specific must come
before generic**. Environment variables are matched before file paths, because the
path pattern would otherwise swallow `API_KEY=/some/path` and redact only half of it.
Adding a pattern means deciding where in the order it goes, not appending it.

It covers all five GitHub token prefixes — `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` —
not just the personal one.

## Adding a validator

- It must serve **two or more** features. One caller keeps its validation local.
- Whitelist, per above.
- Security validators throw; field validators return. Do not blur the two.

## Related

- [`@/core/shell`](../shell/README.md) — the main consumer; every value reaching a
  shell command passes through here first
- [`@/core/logging`](../logging/README.md) — redacts through this module before writing
