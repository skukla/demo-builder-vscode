# ADR-012: Diagnostic Surfaces — Human-First, Agent-Reachable

**Status**: Accepted — prerequisite landed (`fix/mcp-workspace-independence`); surfaces planned for beta.123
**Date**: 2026-07-29
**Decision Maker**: Project Owner
**Implementer**: Planned for beta.123

Related: [ADR-004 Claude Code Harness](004-claude-code-harness.md) (the in-extension MCP server and why Claude Code is the harness), [ADR-006 Thin-Layer Storefront Customization](006-thin-layer-storefront-customization.md) (the `eds-demo-patches` fetch this ADR declines to reuse for diagnostics). **Supersedes** the remote probe-manifest design proposed during the 2026-07-29 diagnostics research.

---

## Context

Two field failures in one week each cost days, and in both the decisive evidence
existed inside the extension at the moment of failure and was discarded.

- A colleague was told eleven times to install an AEM Code Sync GitHub App that
  was already installed and syncing her repo. The extension held the HTTP status
  and Adobe's `x-error` and logged neither. Diagnosis required calling Adobe's
  endpoints by hand, four days later.
- A second colleague hit a Configuration Service 403 whose message told him to
  install AEM Code Sync — on a run where code sync had been verified and 62 pages
  published seconds earlier. Still unresolved at time of writing.

The bottleneck is not fixing bugs. It is getting a diagnosable report from a
colleague's machine to someone who can read it, and being able to ask a *second*
question without shipping a release.

### The design this replaces

Research proposed shipping **interpretation as data**: a `diagnostics.json` in
`skukla/eds-demo-patches`, fetched at runtime the way `code-patches.json` already
is, declaring which checks to run and what each status means. New failure mode →
edit the file → every colleague picks it up. No VSIX.

Two problems.

**It creates a credential-exfiltration surface.** A remote file that directs
authenticated calls is, by construction, a way to point someone's DA.live IMS
token at an arbitrary host. Constraining it (host allowlist, credentials named
rather than supplied, no arbitrary bodies) is possible but is security surface we
would be choosing to create.

**It solves the wrong half.** The manifest ships new *questions*. The reason we
need new questions constantly is that each check is hard-coded and narrow.

> **The rules live in the handbook.** Its ongoing rules are stated in [the development handbook](../../development/handbook.md#diagnostics-and-agent-surfaces); this ADR keeps the reasoning and the rejected alternatives.

## Decision

### 1. Every diagnostic capability has a human surface. That surface is the contract.

A capability is not considered built until a person can reach it without an AI
agent — a command, a button, a rendered section. MCP tools wrap the same core
function; they are an **additional** surface, never the only one.

This is not a preference for humans over agents. It is four practical constraints:

- **Not every colleague uses Claude.** A diagnostic only they can run is a
  diagnostic most of them cannot run.
- **The agent channel was unreachable by default.** One of the two reports above
  included `MCP Server (in-extension): Reachable: No`. That was not a flake: the
  server refused to start without an open workspace folder, and the window model
  never opens one (`shouldReHomeToRoot` explicitly declines to act on an
  undefined workspace). Anyone driving the extension from the sidebar had no
  agent channel at all. Fixed — see Prerequisite below — but the lesson stands:
  the agent path is the one that silently disappears, so it cannot be the only
  path.
- **Human surfaces are verifiable.** A command can be exercised in the Extension
  Development Host and its output read. An agent-only path is materially harder
  to confirm, and both bugs above came from paths nobody had run end to end.
- **"Run this and send me the output" must always exist.** It is the fallback
  that works over Slack, with no setup, for anyone.

### 2. Drop the remote probe manifest.

Ship **capability**, not checks. A small set of general tools composes into many
questions because the caller — human or agent — decides what to ask next. That
reduces how often a new check is needed, rather than building a mechanism to ship
checks between releases.

This removes the credential-direction surface entirely: no remote file names a
destination, so there is nothing to redirect.

### 3. Agents produce evidence, not fixes.

An agent connected to the extension's MCP server may read diagnostics, run probes,
and compose a report or file an issue with the failing call, status, `x-error`,
`x-invocation-id`, and repro context attached. It does not author fixes or open
pull requests against this repository.

- Colleagues have the installed VSIX, not the source, and Claude Code homes at
  the projects root by design — a different workspace from this repo entirely.
- Most failures are not fixable here. The Configuration Service 403 above is an
  Adobe access grant; no patch exists. An agent primed to fix will reach for that
  tool when the answer is "ask an admin."
- A patch from someone who cannot run the suite or reproduce the failure trades a
  diagnosis bottleneck for a review bottleneck. Evidence is the scarce artifact.

## Shape

Each capability lands as a shared core with two surfaces over it:

| Capability | Human surface | Agent surface |
|---|---|---|
| Full diagnostic report | `Demo Builder: Diagnostics` (exists) | `get_diagnostics` (planned) |
| Portable report | `Copy Report` on the completion notification (exists) | tool returns the same structure |
| GitHub↔AEM credential triangulation | rendered section within Diagnostics (exists) | included in the report |
| Config Service write permission | section within Diagnostics (planned) | included in the report |

The human surface and the tool call the same function. Neither may hold logic the
other cannot reach.

## Consequences

- `Copy Report` remains the floor and is never removed. It is what works when the
  MCP server does not.
- Tool returns carry the same secrets discipline as the rendered summary: login,
  credential **type prefix**, granted scopes, booleans, status codes, `x-error` —
  never the credential. A tool hands data to an agent that may log or transmit it.
- MCP tools must be headless-safe: no dialogs, no prompts, no dependence on a
  visible window.
- Adding a genuinely new endpoint still requires a release. That is accepted —
  new endpoints are rare, and a release carries review that a remote file does not.

## Prerequisite (landed)

An earlier draft of this ADR suspected `checkMcp` of probing the wrong socket.
That was wrong — its message was accurate. The real defect sat upstream:
`startInExtensionMcpServer` returned early when no workspace folder was open, so
the server never started. That guard predates the current window model, in which
the window is homed at the projects root and the project is selected by pointer.

Fixed on the maintenance line (`fix/mcp-workspace-independence`, off
`hotfix/beta.122`): `mcpSocketBindings` makes the projects-root socket primary and
always bound — it derives from `projectsDir` with no workspace involved, and it is
the socket per-project `.mcp.json` files already target. A distinct workspace is
bound additionally. `checkMcp` now probes that same primary socket.

The fix lives on the maintenance line rather than `develop` because the defect is
identical on both and beta.123 also ships from there; a `develop`-only fix would
have reached nobody.

**The `decouple-project-from-workspace` backlog item is NOT a prerequisite.** It
targets a different problem — a full window reload when switching projects from
the home grid ("the extension resets"). The MCP-relevant coupling was the single
early return above. This fix removes MCP's dependence on that item rather than
depending on it; the "secondary socket" it describes as temporary is now the
permanent primary.

*Amendment 2026-08-23:* the additional workspace-folder bind (the dual-listen
shim) was removed when the decouple item closed — every `.mcp.json` pins the
projects-root socket, and a cwd-derived proxy that misses it falls back to
live-socket discovery, so nothing targeted the secondary. The server binds
exactly one socket: the projects-root path.

## Open questions

- Whether an agent filing issues should use the colleague's GitHub identity or a
  service identity. Unresolved; affects attribution and rate limits.
