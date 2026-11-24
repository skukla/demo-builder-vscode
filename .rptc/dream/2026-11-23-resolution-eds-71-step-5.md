# Resolution of review eds-71-step-5

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/core/constants.ts, src/features/ai/server/agentAlertCopy.ts, src/features/ai/server/toolNarration.ts, src/features/eds/services/blockLibrary/blockTable.ts, src/features/eds/services/blockLibrary/oldStubPages.ts, src/features/eds/services/blockLibrary/storefrontBlockList.ts, src/features/eds/services/daLive/daLiveBlockDocPages.ts, src/features/eds/services/daLive/daLiveBlockLibraryOperations.ts, src/features/eds/services/daLive/daLiveBlockLibrarySheet.ts, src/features/project-creation/templates/skills/commerce-block-mapper.md, src/features/project-creation/templates/skills/header-nav-footer.md, src/features/project-creation/templates/skills/register-custom-block.md, src/features/project-creation/templates/skills/remove-custom-block.md, src/features/project-creation/templates/skills/sync-changes.md, src/mcp-server.ts, src/mcp/blockAuthoring.ts, src/mcp/blockAuthoringShape.ts, src/mcp/blockLibraryPublish.ts, src/mcp/blockRemoval.ts, src/mcp/blockToolHandlers.ts, tests/core/constants.test.ts, tests/features/ai/mcpServer-blockAuthoringShape.test.ts, tests/features/ai/mcpServer-promoteBlock.test.ts, tests/features/ai/mcpServer-removeBlock.test.ts, tests/features/ai/mcpServer-responseSizes.test.ts, tests/features/ai/mcpServer.testUtils.ts, tests/features/ai/server/responseCeilings.ts, tests/features/eds/services/blockLibrary/storefrontBlockLibrary.test.ts, tests/features/eds/services/blockLibrary/storefrontBlockList.test.ts, tests/features/eds/services/daLive/daLiveBlockLibraryOperations-docPages.test.ts, tests/features/eds/services/daLive/daLiveBlockLibraryOperations-sheetRows.test.ts, tests/templates/block-skills.test.ts, tests/templates/spine-chokepoints.test.ts

5 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | high | Request: the palette does not follow the code for Adobe-library blocks, so a removed Adobe block comes back on the next Refresh Blocks. | PROPOSE FIX | Fixed: an Adobe entry is listed only when the repo has its folder, except CORE_CONTENT_BLOCKS (metadata, section-metadata; verified absent as folders in the template). Re-review confirmed. |
| F2 | medium | Correctness: remove deleted the code before the DA.live row removal, which can throw, leaving code deleted and unreported. | PROPOSE FIX | Fixed: DA.live page and row first, then the code, then push; a failed code delete is reported. Re-review confirmed. |
| F3 | low | Correctness: remove refused folder names the palette lists and promote accepts. | PROPOSE FIX | Fixed: one BLOCK_NAME_PATTERN for promote, remove, shape and the listings. Re-review confirmed. |
| F4 | low | Correctness: skipped-duplicate was misdescribed in the skill. | PROPOSE FIX | Fixed: the skill explains both meanings and what to do. Re-review confirmed. |
| F5 | low | Correctness: the skill said a failed push leaves the deletion committed. | PROPOSE FIX | Fixed: the skill says what a failed push leaves and how to finish. Re-review confirmed. |
