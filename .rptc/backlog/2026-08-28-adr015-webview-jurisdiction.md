---
id: PL-17
kind: question
area: platform
needs: []
value: high
status: backlog
---

# ADR-015 judges 291 webview files by a rule that gives them no legal path

Filed 2026-08-28. Found by the owner asking, of one file the rule flagged, "is
what it does what it's allowed to do though?"

## The gap

ADR-015 names where a service may be constructed:

> the feature's `create...Deps` / `buildDefault...Deps` file builds it — and
> those files, plus `extension.ts`, are the only places that construct services

And where one may be fetched: `extension.ts`, `commands/`, `handlers/`, MCP
tool-registration files.

**Every one of those is an extension-side name.** The ADR does not contain the
words "webview", "UI", or "browser" anywhere — it was written for the extension
host and never scoped.

The enforcement, however, scans everything:

```ts
git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'
```

**Measured 2026-08-28:** 899 source files, of which **291 are webview-side**
(under a `ui/` directory or `.tsx`). A webview file can satisfy `mayConstruct`
only by being named `*Deps.tsx`; there is no webview equivalent of
`extension.ts`, because the rule never imagined one.

So a third of the codebase is subject to a rule whose escape hatches do not
exist on its side.

## Why it has stayed quiet

React components mostly do not construct services, so the hole rarely fires.
Exactly one construction row is webview-side today:

- `src/core/ui/utils/WebviewClient.ts` — `export const webviewClient = new WebviewClient()`,
  a module-level singleton of the webview's single message channel to the
  extension host.

That file is on the ledger with no correct alternative available to it. It
cannot be built in `extension.ts` (different bundle, different runtime) and
there is no sanctioned webview root to build it in.

(Five more webview rows sit on the `hookRefs` list, which is a separate check.)

## Two ways to close it

**A. Scope the ADR to the extension host**, and say plainly what governs webview
code instead — React's own idiom, where dependencies arrive as props or context
and the bundle entry composes the tree. The enforcement then excludes `ui/` and
`.tsx`, and a second, shorter rule covers the webview side.

**B. Name the webview composition roots.** Each bundle already HAS an entry
point, enumerated in `esbuild.config.js` as `WEBVIEW_ENTRIES` — eight of them
(wizard, dashboard, configure, sidebar, projectsList, aiOverview, integrations,
dataInstaller). Those are the webview's `extension.ts`. Adding them to
`mayConstruct`/`mayFetch` makes the rule coherent across both runtimes without
writing a second rule.

**Recommendation: B.** The composition-root pattern the ADR cites (Seemann) is
per-application, and each webview bundle IS a separate application with its own
entry — that is what `esbuild.config.js` already says. Option A splits one idea
into two documents that will drift; B extends the idea it already committed to.

Either way, `WebviewClient` needs an answer, because under B it still is not at a
root — it is a utility module exporting a singleton. Under B the honest fix is
to construct it at each webview entry and pass it down, OR to ratify the
singleton explicitly with the reason (one message channel per bundle, and no
test can meaningfully vary it) rather than leaving it listed as debt nobody can
discharge.

## Why this is filed as a question, not a fix

It changes what the architecture rule CLAIMS, not just what the code does. The
answer determines whether 291 files are in scope or out, and that is the owner's
call, not a discoverable fact.

## Provenance

This surfaced while ranking the construction-boundary debt. The first ranking
put `WebviewClient` at the top on the strength of "59 test suites mock it" —
which conflated a module exporting a singleton of itself with a class building
its own collaborators. They are different problems with different fixes.
Separating the categories is what exposed that the file had no lawful option at
all. Recorded because the mis-ranking is instructive: counting how often
something is mocked says nothing about WHY.
