# Plain failure wording: slices 1 and 2, for beta.153 (PL-102)

Owner, 2026-11-19: build slices 1 and 2 of the research's six now, in beta.153; slices 3 to 6 after
the release, and PL-102 stays open until they are built. Research and the five owner decisions:
`.rptc/research/plain-failure-wording-everywhere/research.md`, `.rptc/backlog/2026-11-17-plain-failure-wording-everywhere.md`.

## The one design point to know

Until slice 4 types the handler errors, some text reaching a progress window is untyped: it may be a
sentence this extension wrote or a library's raw words, and nothing at run time can tell which. A
translator that turned every unknown string into the fallback line would wipe good messages from the
wizard right before the release. So slices 1 and 2 add one named debt function, `notYetPlain()`: it
applies the known translations and passes anything else through unchanged, exactly today's behaviour,
but marked. A rule check counts its calls against a shrink-only ceiling; slices 3 to 6 bring it to zero.
Everything else in these slices is the real thing: typed, cast-proof, translated.

## Slice 1: the door

1. **Core module** `src/core/utils/plainText.ts`: the `PlainText` brand, `plain()` (literals only),
   `plainName()` for a name the SC sees (a project, a website; never error text), `plainJoin()` to build
   a sentence from plain pieces, the fallback line "Demo Builder couldn't tell what went wrong."
   (owner decision 2), a generic `plainFailure()` with the known translations (no answer in time, the
   git "missing blob" merge, HTTP sign-in and server failures) that **falls back instead of passing
   unknown text through**, `PlainError` (an Error carrying its plain sentence) and `notYetPlain()`.
2. **The data installer** keeps its Commerce translations; its `PlainText` becomes the core one (one
   type), and its minting goes through the core's translator-only entry.
3. **Cast ban**: eslint forbids `as PlainText` outside the core module, and importing the
   translator-only entry outside the listed translator modules.
4. **The raw field**: `OperationOutcome` gains `detail` (raw, for agents and logs) beside a plain
   `error`. Agents keep getting the specifics there.
5. **No sentence sends a person to Debug Logs** (owner decision 1): the 23 strings are reworded; the
   Open Debug Logs button stays. A rule check fails on a new one (button labels, the channel's name and
   agent-only diagnostics excepted). The "honest generic" in the user-facing-errors rule, the handbook,
   ADR-023 and the error-handling plan changes to the fallback line.

## Slice 2: the funnels

1. **The progress window**: the payload's `error`, `warning`, `note` and `details`, and a run row's
   `problem`, are `PlainText`. `OperationOutcome.error`, `warning`, `note` and `details` too, so every
   operation that ends in a progress window says its failure in plain words; the compiler lists them
   (about 60). The one catch (`operationProgress.ts`) says the fallback line, raw text to the log.
   `narrateOutcomeToModal`'s handler errors stay untyped until slice 4 and go through `notYetPlain()`.
2. **The wizard's creation failure**: `CreationFailedPayload.error` and `CreationProgress.error` are
   `PlainText`; the creation catch reads a `PlainError`'s sentence, else `notYetPlain()`. The creation
   executors' own failures throw `PlainError` where they are this extension's sentences.
3. **Updates**: `UpdateRowStatus.message` is `PlainText`. F295's one-entry table moves into the core
   `plainFailure()`.
4. **ResultBody**: `outcome` and the string lines are `PlainText`.

## Checks

Test first per slice; the full gate (`checks` tool) before each commit; `notYetPlain` ceiling and the
Debug Logs check both start at their measured counts and may only fall. The visual baseline is owed
before push (no layout change is intended).

## After beta.153 (slices 3 to 6, PL-102 open until done)

3. Provider translators: the mesh rewrite, the Adobe explain functions, `formatGitHubError` wired in
   (owner decision 4). 4. `HandlerResponse.error` and `SimpleResult.error` area by area, each with its
   raw `detail`; agent text that reaches a person in plain words (owner decision 5); `notYetPlain` calls
   fall to zero. 5. StatusDisplay, InlineNotice, a typed VS Code notification wrapper, Show Details for
   the raw text (owner decision 3, mockup first). 6. The words check widened to the whole tree; the
   user-facing-errors rule and its ledger retired; the convention in the handbook.
