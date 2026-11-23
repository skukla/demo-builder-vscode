# Resolution of review eds-71-steps-2-4-recheck

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/eds/services/daLive/daLiveSourceProbe.ts, src/features/eds/services/daLive/daLiveBlockDocPages.ts, src/features/eds/services/daLive/daLiveBlockLibrarySheet.ts, src/features/eds/services/blockLibrary/oldStubPages.ts, src/features/eds/services/blockLibrary/blockSheetRows.ts, src/features/eds/services/blockLibrary/libraryTemplates.ts, src/features/eds/services/blockLibrary/storefrontLibraryWriter.ts, src/features/eds/services/blockLibrary/storefrontBlockLibrary.ts, src/features/eds/services/blockLibrary/storefrontBlockList.ts, src/features/eds/services/blockLibrary/exampleSources.ts

1 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| N1 | medium | Correctness: since untouched placeholders count as replaceable, every Refresh Blocks, reset and Configure rewrites the same placeholder pages, adding a DA.live version each time. | PROPOSE FIX | Fixed: the build hands the writer each generated page's current text; a write whose body matches it (whitespace between tags ignored) is skipped and the block stays listed. Example sources are still read each run, on purpose, so a refresh picks up a new real use. |
