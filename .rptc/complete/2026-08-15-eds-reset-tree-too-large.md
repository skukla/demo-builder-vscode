# EDS reset sends the whole template in one create-tree, and GitHub times out

> **SHIPPED AND VERIFIED LIVE 2026-08-15 — `6a258b96`.** A real reset of
> `skukla/demo-builder-test` (on the very template that was failing) logged
> `Creating tree with 3344 entries in 14 request(s)` and completed the tree in
> ~14 seconds, where it previously timed out at ~12. Commit `8107a42`, 3,378
> files, whole pipeline green through mesh redeploy.
>
> **Two corrections to what this item proposed:**
>
> 1. *"First batch bases on the target branch's current tree"* would have been
>    WRONG. A reset REPLACES the repo, so files the template no longer contains
>    would have survived it. The first batch carries NO `base_tree`; each later
>    batch chains on the previous, making the final tree exactly the union. A
>    test pins this explicitly.
> 2. Batching is by **BYTES, never entry count**, and an entry is never split.
>    Measured on `boilerplate-b2b-template`: 3,340 files, 13.13 MB of content, a
>    **13.55 MB** single request body (this item's "4.74 MB" was the COMPRESSED
>    archive), median entry ~1 KB — and **one entry 3.5 MB on its own**, which
>    is why an oversized entry must become its own request.
>
> **Bonus: a latent data-loss path closed.** Zero entries used to reach
> `createTree` unguarded, producing an EMPTY tree, committing it, and moving the
> branch ref — which empties the repository. A silently failed template download
> was one step from destroying a storefront. It now refuses before any commit.
>
> **Still open, and NOT what this item thought:** the same verified reset did
> NOT install `placeholders/*.json` or `enrichment.json`. The theory that the
> project simply had not been reset is DISPROVED — a full successful reset
> leaves them absent, and the logs never mention them. Tracked separately.

**Filed:** 2026-08-15, from a live reset failure on a B2B storefront.
**Severity:** breaks reset outright for any project on a large template. Not
intermittent, not size-dependent-on-luck — the same template fails every time.
**Not a regression from any feature branch:** the code path is unchanged on
develop, and the failure is in step 1 of the pipeline.

## Symptom

```
Failed to reset EDS project: Sorry, your request timed out. It's likely that
your input was too large to process. Consider building the tree incrementally,
or building the commits you need in a local clone of the repository and then
pushing them to GitHub.
```

## Measured, from the Debug Logs of the failing run

```
[GitHub] Downloading repository archive from
         adobe-commerce/boilerplate-b2b-template@aeb4b028 (SHA)
[GitHub] Downloaded 4.74 MB archive
[GitHub] Extracted 3342 files from archive
[GitHub] Creating tree with 3344 entries        <- one request
[EdsReset] Reset failed                          <- ~12s later
```

## Cause

`resetRepoToTemplate` downloads the template zipball, then builds **one**
`create-tree` request carrying every file's **content inline**
(`githubFileOperations.ts:600-645`). There is no batching in that file.

So the request body is the entire repository. 4.74 MB of source becomes
substantially more once 3,344 files are JSON-escaped into a single POST, and
GitHub gives up on it.

This is not specific to B2B. B2B is simply the first template big enough to
cross the line; any template of comparable size does the same, and templates
only grow.

## The fix is half-written already

`createTree` (`githubFileOperations.ts:366`) already takes a `baseTree`
parameter and forwards it as `base_tree`. The reset calls it with three
arguments, so nothing chains. `blockCollectionHelpers.ts:273` already calls it
WITH a base tree, so the pattern exists in this codebase.

Chunking is what GitHub's own error recommends:

1. split the entries into batches
2. first batch bases on the target branch's current tree
3. each later batch bases on the previous batch's returned SHA
4. commit the final SHA

Same end state, small requests. Batch size wants measuring rather than guessing
— the ceiling is request BYTES, not entry count, and one 2 MB file behaves very
differently from a thousand 2 KB ones.

The documented alternative is create-blob per file then one tree of SHAs. That
is 3,344 extra round trips against a rate limit, so it is the fallback if
chunked trees still time out, not the first move.

## Worth checking while in here

Whether the same single-request shape appears anywhere else that walks a whole
repo — `installBlockCollections` builds tree entries too. It has not been seen
to fail, but it has not been measured against a large collection either.

## Reproduce

Reset any project whose stack uses `boilerplate-b2b-template`. The failure is
immediate and total; no partial write happens, because the tree is rejected
before any commit or ref update.
