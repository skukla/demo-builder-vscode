# The conventions to develop against

The research turned into rules. Three of them, each stated the way the handbook states
a convention — the rule, why, and the thing that fails the build when it is broken.

They are written here rather than dropped straight into the handbook because of that
handbook's own invariant: **every convention it states is enforced and true today.** Two
of these are not true today — 53 sites break the first, and the third describes code that
does not exist yet. The repo's established answer to that is a shrink-only ledger, the
same mechanism holding the god-file counts, the Pattern B push ceiling and the
type-erasing casts. Sequencing is at the bottom.

---

## 1. A failure a PERSON reads is translated, never the library's own words

> **Convention.** A failure returned toward a webview carries a message written for an
> SC. It never carries a raw `Error.message`.
>
> *Why:* the extension's job at a failure is to say what went wrong and what to do about
> it. `Request failed with status code 403` does neither — it names a transport detail
> and leaves the person to guess which permission, which account, which site. The
> architecture doc already sets this bar for the three provider formatters: "if the
> output is not more actionable than the input, the formatter is not earning its place."
> Most failure paths never reach one. Measured 2026-09-11: **~53 sites** build a
> user-facing failure as `(e as Error).message` or the `instanceof Error ? … : …`
> variant, against ~25 that translate or type first.
>
> *What counts as translated:* a per-provider formatter (three exist, for Adobe IMS and
> Console, for GitHub/DA.live/Helix, and for `aio api-mesh`), or a domain error's own
> `userMessage`. A feature with no provider-specific knowledge uses an honest generic —
> "Could not reach Adobe Console. See Debug Logs for details." — which is less specific
> and never misleading. The raw text still goes to the Debug Logs channel, where it
> belongs and where it is useful.
>
> Enforced by `tests/sop/user-facing-errors.test.ts` against a shrink-only ledger of the
> sites that predate the rule.

**Why a ledger and not a clean ban:** 53 sites cannot be fixed in one change without
touching a dozen features at once, and a rule introduced as 53 failures is a rule people
turn off. The ceiling makes the count fall and never grow, which is how every other
inherited violation in this repo has been retired.

---

## 2. A failed tool call is reported as a FAILURE

> **Convention.** An MCP tool that fails returns a tool execution error — a result
> carrying `isError: true` — never a successful result whose text says it failed. The
> text is specific enough for an agent to retry against.
>
> *Why:* the MCP specification defines two error mechanisms and asks clients to treat
> them differently. Protocol errors (unknown tool, malformed request) are opaque to a
> model. Tool execution errors "contain actionable feedback that language models can use
> to self-correct and retry with adjusted parameters", and "Clients **SHOULD** provide
> tool execution errors to language models to enable self-correction."
>
> Measured 2026-09-11: **`isError` is set nowhere in `src/`** — zero occurrences. Every
> failed tool call is returned as a SUCCESSFUL result whose text happens to contain
> `success: false`, so a client cannot distinguish failure from success at the protocol
> level. That is precisely the distinction the spec asks it to act on, and the cost is
> the agent's best recovery path.
>
> *Specific enough to retry against* is the spec's own bar, and its example is the
> standard to hold: "Invalid departure date: must be in the future. Current date is
> 08/08/2025." A message an agent cannot act on differently is not a tool error, it is a
> dead end wearing one.
>
> Enforced by `tests/sop/tool-failure-envelope.test.ts` — the descriptor registrar's
> failure path sets `isError`, and the response-envelope suite already runs over all
> descriptor rows at runtime, so it extends rather than duplicates.
>
> [MCP specification, Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)

**This one is not a ledger.** It is a single chokepoint — the descriptor registrar and
`mcpToolResult` — so it can be made true before the convention lands, and then the rule
never has an exemption.

---

## 3. Message text decides RETRIES, never what anyone is told

> **Convention.** Classifying an error by matching its message text is allowed for
> deciding whether to retry, and for nothing else. It never decides what an SC or an
> agent is told.
>
> *Why:* the two uses have opposite tolerances for guessing. A wrong transience guess
> costs one retry; a wrong display guess tells a person the wrong thing to do. This repo
> already made that judgement once and then half-unmade it: a generic FORMATTER was tried
> and removed because "a shared one has to guess which provider produced a string", while
> a generic CLASSIFIER doing exactly that guessing survived — `toAppError()`, which
> matches on `includes('timeout')`, `includes('econnrefused')`, `includes('unauthorized')`
> and hands back an `AppError` carrying a `userMessage`. All 19 of its call sites ask the
> retry question; the `userMessage` invites the use that was rejected.
>
> *The shape this takes:* the transience predicate keeps the message matching and stops
> returning anything displayable. Display comes from a formatter that KNOWS its provider,
> or from a domain error that was constructed knowing what went wrong.
>
> Enforced by `tests/sop/user-facing-errors.test.ts` (same suite as convention 1) — the
> transience helper's return type carries no user-facing field, so the compiler refuses
> the misuse rather than a scan catching it afterwards.

---

## The envelope these three share

Not a convention — a data shape, and worth stating because all three depend on it.

A failure crossing a boundary carries four things:

| | for |
|---|---|
| `code` | programmatic branching; already adopted, 201 uses across 47 files |
| `userMessage` | the SC — plain, actionable |
| `technical` | the Debug Logs channel, and the agent's retry decision |
| `recoverable` | whether offering "Retry" is honest |

**`AppError` already defines exactly this**, and the strongest argument for keeping it is
that the MCP specification arrived at the same decomposition independently: a message for
a model to act on, distinct from the transport detail underneath. Keep the shape. The
class hierarchy under it is a separate question — four classes, barely used, and
convention 4 of PL-55 already rules that it may only shrink.

The two audiences want different fields from one failure. That is why it is one envelope
and not one string.

---

## Sequencing — what has to be true before each rule lands

| | Before the convention can enter the handbook |
|---|---|
| **2. Tool failures** | Make it true first — one chokepoint, no exemptions. Do this one regardless of the others; it is spec conformance |
| **3. Message matching** | Split `toAppError` into a transience predicate with no displayable field. 19 call sites, all asking the same question |
| **1. Translated failures** | Needs the ledger seeded with today's count and a default translator per feature. The bulk of the work, and the only user-visible payoff |

Then ADR-023 records the decision, and the three conventions cite it.

**Do not land convention 1 without the ledger.** A rule that arrives already broken 53
times teaches people that conventions are aspirational, which is the failure this whole
program exists to reverse.
