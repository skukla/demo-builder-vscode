# The development handbook — what the rules are, and where each one lives

**This is the current rules. It is meant to be edited.** If a rule changes, change it
here.

That is the opposite of an ADR, and the distinction is the whole point of this file.

---

## Who is this for, and who are ADRs for?

A question worth answering plainly, because the two documents have different jobs and
mixing them is what produced a 6.7-page ADR carrying seven rule sections.

| | This handbook | An ADR |
|---|---|---|
| Answers | **What do I do?** | **Why is it this way?** |
| Tense | Current. Always describes today. | Historical. Describes one moment. |
| Changes by | Editing it | Writing a NEW record that supersedes the old |
| Read by | Anyone writing code here — person or agent | Someone asking why, or evaluating whether a decision still holds |
| If it is wrong | It is a bug. Fix it. | It is still correct — it recorded what was decided then |

**Are ADRs for humans or AI?** On the evidence, **for humans** — and the research behind
that answer is in
[`.rptc/research/adr-purpose-and-practice/research.md`](../../.rptc/research/adr-purpose-and-practice/research.md).
Michael Nygard's 2011 original says an ADR is written *"as if it is a conversation with a
future developer."* Of the five authorities read — Nygard, MADR, ThoughtWorks, AWS,
Microsoft Well-Architected — **none mentions AI, LLM or agent audiences at all**,
including a Microsoft page updated in April 2026. The strongest academic source runs the
other way: it uses LLMs to *generate* rationale for humans.

**But agents plainly do read them here**, and heavily — ADR-015 is referenced by 32 source
files and 73 test files. So the honest position is:

> An ADR is written for a human asking *why*. An agent reads it anyway, and what the agent
> actually needs is a short, current, checkable rule — which is what this handbook is.

Neither document is "for AI". This one is simply the one an agent can act on without
having to work out whether it still applies.

**When you need to change how the code works:** edit the rule here. If the *reason*
changed too — if a decision was reversed rather than refined — write a new ADR that
supersedes the old one, and update the rule here to match. Do not edit an accepted ADR;
three independent authorities (Nygard, AWS, Microsoft) say an accepted record is
append-only.

---

## The rules

Every row points at the full statement. Where something enforces a rule, the enforcer is
named — an unenforced rule relies on review, and it is worth knowing which kind you are
looking at.

### Dependencies and structure

| Rule | Full statement | Enforced by |
|---|---|---|
| Services are fetched only at the boundary (`extension.ts`, `commands/`, `handlers/`, MCP registrars). Below that, dependencies arrive as parameters. | [ADR-015 § Decision](../architecture/adr/015-dependency-architecture.md) | `tests/sop/architecture-rules.test.ts` |
| Construction happens in `extension.ts` or a feature's `create...Deps` file. Enforced for any class that accumulates state. | [ADR-015 § Decision](../architecture/adr/015-dependency-architecture.md) | `tests/sop/architecture-rules.test.ts` |
| A **session accessor** (`getX()` + `resetX()`) is the one other place that may construct — and only for a service whose state must outlive a single call. | [ADR-015 § Session accessors](../architecture/adr/015-dependency-architecture.md) | ledger in `architecture-rules.exemptions.json` |
| A repeated composition point builds nothing stateful. | [ADR-015 § A cache is only as useful as…](../architecture/adr/015-dependency-architecture.md) | `tests/sop/architecture-rules.test.ts` |
| **Services** arrive in the feature's ONE deps bundle; **data** arrives as ordinary parameters. A service never takes `HandlerContext`. | [ADR-015 § The dependency ENVELOPE](../architecture/adr/015-dependency-architecture.md) | — (guidance) |
| `@/core/*` and `@/types` are imported THROUGH their barrels. Features are imported deep and get no new barrel. | [ADR-015 § Barrel files](../architecture/adr/015-dependency-architecture.md) | — (guidance) |
| Commands extend `BaseCommand` / `BaseWebviewCommand`. | [ADR-015 § Two rules the enforcer checks](../architecture/adr/015-dependency-architecture.md) | `tests/sop/architecture-rules.test.ts` |
| Files under `src/types/` use `import type` only. | [ADR-015 § Two rules the enforcer checks](../architecture/adr/015-dependency-architecture.md) | `tests/sop/architecture-rules.test.ts` |
| Where a given kind of code goes. | [where-code-goes.md](../architecture/where-code-goes.md) | `tests/sop/mirror-placement.test.ts` |
| Features do not import other features; commands may import any feature. | [src/features/CLAUDE.md](../../src/features/CLAUDE.md) | eslint `no-restricted-imports` |

### Tests

| Rule | Full statement | Enforced by |
|---|---|---|
| Three tiers — unit (handed-in deps, assert the arguments), contract (fixtures captured from live responses), live (journeys). | [ADR-016](../architecture/adr/016-test-strategy.md) | — (guidance) |
| Effectiveness is measured by mutation testing, not coverage. | [ADR-016](../architecture/adr/016-test-strategy.md) | `npm run test:mutation` |
| A split test family shares its setup through one `.testUtils` file, which owns the mocks AND the subject import. | [`.claude/skills/webview-test-authoring`](../../.claude/skills/webview-test-authoring/SKILL.md) | `tests/sop/test-family-setup.test.ts` |
| No test file over 750 lines (warning at 500). | [test-file-splitting-playbook.md](../testing/test-file-splitting-playbook.md) | `npm run validate:test-file-sizes` |
| Never pipe jest through `tail`/`head`/`grep`; redirect to a file as `> file 2>&1`. | [CLAUDE.md](../../CLAUDE.md) | `.claude/hooks/rules/10-jest-pipe.rule`, `11-jest-redirect.rule` |
| Never run two jest runs at once. | [CLAUDE.md](../../CLAUDE.md) | `.claude/hooks/rules/15-jest-concurrent.rule` |
| A mock cannot see a malformed call — assert the ARGUMENT, or drive the real collaborator. | [CLAUDE.md](../../CLAUDE.md) | — (guidance) |

### Webviews and styling

| Rule | Full statement | Enforced by |
|---|---|---|
| The composition root is the bundle entry; dependencies arrive as props; hooks are the service layer. | [ADR-017](../architecture/adr/017-webview-architecture.md) | `tests/sop/webview-architecture-rules.test.ts` |
| CSS is vendored in the lowest layer; `!important` is not a mechanism. | [ADR-018](../architecture/adr/018-css-architecture.md) | — (guidance) |
| Spectrum/webview gotchas (Flex 450px, dimension tokens, box-sizing). | [ui-patterns.md](ui-patterns.md), [styling-guide.md](styling-guide.md) | — (guidance) |

### Diagnostics and agent surfaces

| Rule | Full statement | Enforced by |
|---|---|---|
| Every diagnostic capability has a HUMAN surface — a command, a button, a rendered section. It is not built until a person can reach it without an agent. | [ADR-012 § 1](../architecture/adr/012-diagnostic-surfaces.md) | — (guidance) |
| MCP tools wrap the same core function. They are an **additional** surface, never the only one. | [ADR-012 § 1](../architecture/adr/012-diagnostic-surfaces.md) | `.claude/skills/ai-coverage-scan` |
| Agents produce EVIDENCE, not fixes — read diagnostics, run probes, compose a report. | [ADR-012 § 3](../architecture/adr/012-diagnostic-surfaces.md) | — (guidance) |
| Ship capability, not checks. A small set of general tools composes into many questions; do not build a mechanism to ship new checks between releases. | [ADR-012 § 2](../architecture/adr/012-diagnostic-surfaces.md) | — (guidance) |

### Multisite readiness

These two are live disciplines from a decision that was deliberately NOT implemented —
the seam is documented so the eventual migration is cheap. Both are followed today
(11 sites default to `'main'`).

| Rule | Full statement | Enforced by |
|---|---|---|
| A new metadata field on project state defaults to the `'main'` environment. | [ADR-003](../architecture/adr/003-multisite-architecture-seam.md) | — (guidance) |
| A new function that depends on `daLiveOrg` / `daLiveSite` / workspace ACCEPTS them as parameters rather than reaching for a global. | [ADR-003](../architecture/adr/003-multisite-architecture-seam.md) | — (guidance) |

### Patterns

| Rule | Full statement | Enforced by |
|---|---|---|
| Error handling — domain error types, granular catches. | [patterns/error-handling.md](../patterns/error-handling.md) | — (guidance) |
| Resource disposal. | [patterns/resource-disposal.md](../patterns/resource-disposal.md) | — (guidance) |
| State management and ownership. | [patterns/state-management.md](../patterns/state-management.md), [state-ownership.md](../architecture/state-ownership.md) | — (guidance) |
| Selection pattern. | [patterns/selection-pattern.md](../patterns/selection-pattern.md) | — (guidance) |

### Working practice

| Rule | Full statement | Enforced by |
|---|---|---|
| When something is obsolete, delete it. No "(Deprecated)" stubs, no accepted-but-ignored schema. | [CLAUDE.md](../../CLAUDE.md) | `.claude/skills/dead-code-scan` |
| Secrets go through user-scoped VS Code settings — never constants, defaults or fixtures. This repo is PUBLIC. | [CLAUDE.md](../../CLAUDE.md) | GitGuardian |
| Verified duplication gets FIXED in the same turn, not reported. | [CLAUDE.md](../../CLAUDE.md) | — (judgement) |
| A check whose exit code passes through a pipe is not a check. Capture it in a variable. | [CLAUDE.md](../../CLAUDE.md) | — (judgement) |
| Never publish an identifier you have not read from the source. | [CLAUDE.md](../../CLAUDE.md) | — (judgement) |
| Commit to `develop`; reach `master` only through the release process. | [`.claude/skills/cut-release`](../../.claude/skills/cut-release/SKILL.md) | `.githooks/commit-msg` |

---

## What is deliberately NOT here

- **Procedures.** How to cut a release, how to add an MCP tool, how to run the loop —
  those are skills in `.claude/skills/`, invoked rather than read.
- **System explanations.** How the MCP server or the data installer works lives in
  `docs/systems/`.
- **The reasoning.** Every "why" is in the ADR each row links to. Duplicating rationale
  here would create two copies that drift, which is the failure this repo has spent
  considerable effort removing.

## Keeping it honest

Every link in this file is checked by `tests/sop/handbook-links.test.ts`. A rule pointing
at a document that moved or vanished fails the build.

That check exists because of a measured failure, not a hypothetical one: on 2026-08-30
`src/features/CLAUDE.md` was found asserting that every feature barrel had been deleted
and that adding one would be "dead on arrival", while 48 barrels existed and 40 had
importers. A convention document that is confidently wrong is worse than none, because
people act on it.

The link check cannot tell you a rule is *stale* — only that its target exists. Judging
whether a rule still describes reality is a release-cut job; see
`.claude/skills/codebase-sweep`.
