# Resolution of review eds-71-steps-2-4

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/eds/services/blockLibrary/storefrontBlockLibrary.ts, src/features/eds/services/blockLibrary/storefrontBlockList.ts, src/features/eds/services/blockLibrary/storefrontLibraryWriter.ts, src/features/eds/services/blockLibrary/oldStubPages.ts, src/features/eds/services/blockLibrary/blockSheetRows.ts, src/features/eds/services/blockLibrary/blockDoc.ts, src/features/eds/services/blockLibrary/libraryTemplates.ts, src/features/eds/services/blockLibrary/exampleSources.ts, src/features/eds/services/daLive/daLiveBlockDocPages.ts, src/features/eds/services/daLive/daLiveBlockLibrarySheet.ts, src/features/eds/services/edsPipeline.ts

9 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: the old-stub check matches any plain text in the cell, so a stub whose text someone rewrote, or an agent-promoted page with one plain-text cell, is treated as Demo Builder's and replaced. | PROPOSE FIX | Fixed: isOldStubPage needs the cell text to equal the block's sheet row name or displayName(id); rewritten text and promoted pages are kept. Re-review confirmed. |
| F2 | medium | Correctness: when every block's page write fails, the writer returns success with zero blocks and no error, so the SC gets no warning. | PROPOSE FIX | Fixed: blocks requested and none got a page returns success:false with a plain warning. Re-review confirmed. |
| F3 | medium | Correctness: every full rebuild replaces the site config's library list whole, deleting rows the SC added. | PROPOSE FIX | Fixed: the rebuild passes keepOtherRows:true. Re-review confirmed. |
| F4 | medium | Correctness: Adobe's template pages and templates.json are rewritten on every build with no check for an existing page. | PROPOSE FIX | Fixed: template pages copied only when absent; templates.json merged keeping existing rows. Re-review confirmed. |
| F5 | medium | Correctness: an expired DA.live sign-in is swallowed, so the re-auth retry never runs. | PROPOSE FIX | Fixed: DaLiveAuthError rethrown from the page read, both sheet reads, writeBlockPage and the probe. Re-review confirmed. |
| F6 | medium | Correctness: the copy and create paths assume opposite DA.live overwrite behaviour, and the existence probe treats errors as no page. | PROPOSE FIX | Resolved: verified from adobe/da-admin src/storage/object/put.js that DA.live always writes on POST; new sourcePresent probe treats only 404 as absent and anything unknown as present; comment at createSource states the fact. Re-review confirmed. |
| F7 | low | Correctness: placeholder pages this build writes can never be upgraded to a real example later. | PROPOSE FIX | Fixed: isGeneratedPlaceholder makes untouched Import Blocks-style placeholders replaceable; edited ones are kept. Re-review confirmed (its follow-on N1 is fixed and recorded separately). |
| F8 | low | Correctness: a library block's real use is taken from every installed library's site, not its own library's. | PROPOSE FIX | Fixed: library-site uses keyed org/site/blockId and read only from the providing library's site. Re-review confirmed. |
| F9 | low | Correctness: a rebuild replaces a promoted block's chosen title with displayName(id). | PROPOSE FIX | Fixed: a matched row keeps its own name and path, only missing columns are filled; mergeBlockRows deleted. Re-review confirmed. |
