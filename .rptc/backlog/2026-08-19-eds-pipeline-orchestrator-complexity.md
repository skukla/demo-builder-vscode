# `executeEdsPipeline` is a 254-line orchestrator at complexity 27

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
