# `executeEdsPipeline` is a 254-line orchestrator at complexity 27

> ## CLOSED 2026-08-23 — rewritten as the declarative step list, live-validated on all three paths
>
> Executed exactly as this item designed it, on its own branch
> (`refactor/eds-pipeline-step-list`), after settling the two questions it
> required: the shared locals became a three-field `PipelineContext`
> (contentFilesCopied, libraryPaths, patchReport) that IS the accumulating
> result, and the per-step error semantics are DECLARED on each descriptor
> (`onError: 'continue'` + the exact failure-log prefix for library-publish
> and prewarm; everything else aborts through the single outer catch, which
> keeps the DaLiveAuthError rethrow). Gating lives in `when` predicates in
> data; the orchestrator is a loop; the complexity-27 warning is gone and the
> whole-repo lint reports zero warnings.
>
> Live-validated per this item's own bar, all three consumer paths against
> real cloud resources on 2026-08-23: refresh-block-library (proved by the
> CDN's fresh last-modified), reset (full pipeline incl. clear + prewarm),
> and create (CitiSignal/ACCS via the wizard). The FIRST live run caught a
> real regression from the same day's legacyLookupKey work — three
> daLiveSite readers without the repo-name fallback, one of which broke
> reset in beta.138 — which is precisely why the live-runs requirement was
> written in.

**Filed:** 2026-08-19, after `decompose-god-file` rejected `edsPipeline.ts` as a
decomposition target and pointed here instead.
**Type:** complexity reduction, NOT a file split. See below for why that matters.

## The measurement

`src/features/eds/services/edsPipeline.ts` is 839 lines, and eslint warns on every
touch:

```
executeEdsPipeline has a complexity of 27. Maximum allowed is 25   complexity
```

Pre-existing and stable: 27 both before and after an unrelated edit on 2026-08-19,
with only the line number moving (560 → 585).

## Why decomposition is the wrong tool

`edsPipeline.ts` fails `decompose-god-file`'s coupling test — 5 non-type imports
against a >15 signal, ONE public export against >10, a single entity domain. Its
rule is "threshold without coupling → leave it", and the file is genuinely
cohesive: one orchestrator plus eight private step helpers.

More decisively, **moving those helpers out would not reduce the number the warning
is about.** All 27 branches are step-gating inside `executeEdsPipeline` itself:

```
clearExistingContent · skipContent · contentSource · includeBlockLibrary
purgeCache · skipPublish · libraryPaths.length · byomOverlayUrl && project
plus nested try/catch around the library-publish and prewarm steps
```

Extract every helper and all of them remain. The file shrinks; the warning stays.

## The shape of the fix

The orchestrator is a linear sequence of conditional steps, which is exactly what a
declarative step list expresses:

```ts
const STEPS = [
  { name: 'clear-content',  when: (p) => p.clearExistingContent, run: pipelineClearContent },
  { name: 'copy-content',   when: (p) => !p.skipContent,         run: pipelineCopyContent },
  …
];
```

The orchestrator becomes a loop and its complexity collapses toward 1. The gating
moves into data, where each condition is readable on its own line and testable
without running the pipeline.

## Why this is NOT a quick win

`executeEdsPipeline` is the shared spine of **create, reset and refresh-block-library**
— three surfaces, all of which provision real cloud resources. A rewrite of its
control flow is a behaviour-risk change that wants its own branch, its own live
runs on all three paths, and a reviewer who is not tired. It should not ride along
with unrelated fixes.

Two things to settle first:

1. **Do the steps share mutable state?** Several write to locals the later steps
   read (`libraryPaths`, `repoResetResult`, patch reports). A step list needs an
   explicit context object rather than closure variables, and designing that is
   most of the work.
2. **Error semantics per step.** Today some steps are try/caught and continue, one
   rethrows `DaLiveAuthError`, and prewarm is defended twice. Those differences are
   deliberate and each is documented at its site; the step descriptor has to carry
   them rather than flatten them.

## Do not

- Do not "fix" this by splitting the file. That was tried on paper and rejected —
  see the note in `eds-services-over-size-threshold.md`.
- Do not raise the eslint threshold. The warning is correct.
