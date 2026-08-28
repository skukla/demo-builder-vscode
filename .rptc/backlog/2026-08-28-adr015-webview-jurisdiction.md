---
id: PL-17
kind: question
area: platform
needs: []
value: high
status: backlog
title: Frontend architecture has rules but no document — ADR-015 covers only the extension host
---

# The architecture is written for the extension host only; the frontend has rules but no document

Filed 2026-08-28. Started as a narrow question — the owner asked, of one file
the rule flagged, "is what it does what it's allowed to do though?" — and
widened when the answer turned out to be "nothing on that side could be."
Widened again when the owner observed that the real gap is frontend versus
backend, which the evidence below supports.

## This extension is two programs, and only one is written down

| | Extension host | Webviews |
|---|---|---|
| Runtime | Node, with the `vscode` API | Browser bundles, no `vscode` API |
| Composition root | `src/extension.ts` | 8 bundle entries (`WEBVIEW_ENTRIES` in `esbuild.config.js`) |
| How dependencies arrive | constructor / function arguments | React props and context |
| Shared-service lookup | a locator, confined to boundaries | none possible — different bundle |
| Files (measured 2026-08-28) | 608 | **291** |

ADR-015 describes the left column. It was applied to both.

## The gap is not theoretical — it is already producing undocumented rules

**ADR-015 mentions "webview", "browser", "React" and "hook" ZERO times.**

And yet, of the six checks enforced under its name in
`tests/sop/architecture-rules.test.ts`, one is a pure frontend rule:

```
describe('ADR-015: custom-hook calls do not take inline []/{} literals', ...)
```

That is React's re-render trap — passing a fresh `[]` into a custom hook whose
`useEffect` depends on it loops forever. It is real, it is enforced, it has five
files on its exemption ledger, and **it is documented in no ADR**. It was filed
under ADR-015 because there was nowhere else to put it.

That is the finding. Frontend rules are not missing; they are being invented and
enforced under a document that does not claim them, where nobody will look for
them and nothing keeps them coherent.

## The narrow symptom that started this

`src/core/ui/utils/WebviewClient.ts` — `export const webviewClient = new WebviewClient()`,
the webview's single message channel to the extension host. It sits on the
construction ledger with **no lawful alternative**: it cannot be built in
`extension.ts` (different bundle, different runtime), and ADR-015 names no
webview construction site. It is listed as debt that cannot be discharged.

## What to do

**Two documents, not one.** (This supersedes an earlier recommendation in this
item to simply add the webview entries to ADR-015's allowed list. That would fix
`WebviewClient` and leave the hook rule still homeless — treating the symptom.)

1. **Amend ADR-015 to declare its scope: the extension host.** One paragraph.
   Its enforcement then excludes `ui/` and `.tsx`, and stops judging 291 files by
   a rule that never considered them.

2. **Write the frontend ADR.** It has content already — it just has to be
   collected and named:
   - **Composition root**: the 8 bundle entries. That is where a webview-side
     service (the message client, a store) is built and passed down.
   - **How dependencies arrive**: props and context. Not constructor injection —
     the mechanism genuinely differs, which is why one rule cannot cover both.
   - **The hook-literal rule**, moved out of ADR-015 and given its real home,
     with its five ledger entries.
   - **Spectrum/webview constraints already recorded elsewhere**: the Flex 450px
     trap and the dimension-token rules live in the `spectrum-webview-ui` skill
     and in `docs/development/ui-patterns.md`. An ADR should say which of those
     are architecture and which are style.
   - **`WebviewClient`**: either built at each entry and passed down, or the
     singleton ratified explicitly (one message channel per bundle; no test can
     meaningfully vary it) — but decided, not left listed as undischargeable debt.

3. **Split the enforcement file** to match, so a frontend check is not reported
   as an ADR-015 violation.

## Why this is a question and not a fix

It changes what the architecture CLAIMS and adds a document. Which rules are
architecture versus style is a judgement about what the team wants enforced,
not a fact discoverable from the code.

## Provenance

Surfaced while ranking construction-boundary debt. The first ranking put
`WebviewClient` at the top on "59 test suites mock it", which conflated a module
exporting a singleton of itself with a class building its own collaborators.
Separating those categories is what exposed that the file had no lawful option
at all. Recorded because the mis-ranking is instructive: counting how often
something is mocked says nothing about why.
