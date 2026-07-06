# Decompose `daLiveContentOperations.ts` — god-file

**Filed:** 2026-07-06
**Status:** Ready — structural refactor, pick up in a trim cycle (not mid-feature).
**Skill:** `.claude/skills/decompose-god-file/` (procedure) · SOP `.rptc/sop/god-file-decomposition.md`

## Why this exists

`src/features/eds/services/daLiveContentOperations.ts` is **2,883 lines / ~50 methods** in one
`DaLiveContentOperations` class — the largest single file in `src/`, well over every SOP threshold
(service action-required >400). It was itself extracted out of `DaLiveService`, so it's a known,
long-standing decomposition target, and it is **still growing** (2,537 lines when the SOP-scan
burn-down was filed on 2026-06-10 → 2,883 now).

It was explicitly held OUT of the generic SOP-pattern burn-down
(`2026-06-10-sop-pre-existing-patterns.md`) because a structural split doesn't belong in a
"swap a few helpers" pass — it needs its own reviewable workstream. The structural-baseline entry
(`2026-05-21-structural-baseline.md`) will *surface* this file in its SOP-violations table, but it
is measurement-only and does not own the decomposition. This entry is that owner.

## Responsibility groups (candidate seams)

The class mixes at least six responsibilities — a Facade + Specialized Services split (SOP Pattern A):

- **Token/auth**: `getAccessToken`, `inspectToken`, `getTokenManager`, `getImsToken` (the module-level
  `createDaLiveTokenProvider` / `createDaLiveServiceTokenProvider` factories already live outside the class).
- **Content copy/sync**: `copyContent`, `copySingleFile`, `copySpreadsheetFile`, `copyDaLiveSite`,
  `copyContentFromSource`, `copyMediaFromContent`, `copyMediaFromLocalPath`, `collectLocalMediaFiles`,
  `uploadLocalFile`.
- **HTML transform / path resolution**: `transformHtmlForDaLive`, `buildSourceUrl`, `resolveDaPath`,
  `processHtmlContent`, `discoverAndCopyReferences` (+ module-level `extractReferencedPaths`,
  `filterProductOverlays`).
- **Source CRUD (DA.live API)**: `createSource`, `deleteSource`, `sourceExists`, `deleteSiteRoot`,
  `deleteAllSiteContent`, `listDirectory`.
- **Block-library management (~14 methods — the fattest cluster)**: `createBlockLibrary`,
  `createBlockLibraryFromTemplate`, `appendBlockToLibrary`, `removeBlockFromLibrary`,
  `deleteBlockDocPage`, `removeBlockLibraryRow`, `readBlockLibraryRows`, `registerBlocksLibrarySection`,
  `upsertBlockDocPage`, `ensureBlockDocPages`, `copyBlockDocPagesFromSources`, `generateStubDocPages`,
  `getBlocksWithDocs`, `createJsonSpreadsheet`. Strong candidate for its own
  `DaLiveBlockLibraryOperations` first — it's the most self-contained.
- **Config writes**: `updateSiteConfig`, `applyOrgConfig`, `applySiteConfig`, `writeMergedDataConfig`
  (load-bearing: site-vs-org config scope — see the AEM config-scope memory before moving these).
- **Content-path discovery**: `getContentPathsFromDaLive`, `getContentPathsFromIndex`,
  `enumerateAndFilterContentPaths`, `backfillEssentialPaths`. Plus HTTP util `fetchWithRetry`,
  `createErrorFromResponse`, and the `overlayAccountChrome` outlier.

## Approach

Follow `decompose-god-file`: extract the **block-library cluster first** (leaf-most, most
self-contained), TDD each extracted unit, integrate via a thin `DaLiveContentOperations` facade that
keeps the current public API so no consumer/test changes. Then peel off config-writes and
content-copy. Run `circular-dependency-scan` after each extraction. Keep the load-bearing DA.live
scope rules intact (config site-vs-org, canvas doc path).

## Constraints

- Structural, high blast-radius — **not** a good rider on unrelated work; own commit(s), own review.
- Behavior-preserving; the DA.live external-service traps are in `.claude/skills/eds-publish-and-config/`.
- Downstream of / informed by the structural baseline if that runs first (it may re-rank seams).
