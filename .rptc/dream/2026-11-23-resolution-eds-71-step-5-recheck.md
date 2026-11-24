# Resolution of review eds-71-step-5-recheck

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/core/constants.ts, src/features/ai/server/agentAlertCopy.ts, src/features/ai/server/toolNarration.ts, src/features/eds/services/blockLibrary/blockTable.ts, src/features/eds/services/blockLibrary/oldStubPages.ts, src/features/eds/services/blockLibrary/storefrontBlockList.ts, src/features/eds/services/daLive/daLiveBlockDocPages.ts, src/features/eds/services/daLive/daLiveBlockLibraryOperations.ts, src/features/eds/services/daLive/daLiveBlockLibrarySheet.ts, src/features/project-creation/templates/skills/commerce-block-mapper.md, src/features/project-creation/templates/skills/header-nav-footer.md, src/features/project-creation/templates/skills/register-custom-block.md, src/features/project-creation/templates/skills/remove-custom-block.md, src/features/project-creation/templates/skills/sync-changes.md, src/mcp-server.ts, src/mcp/blockAuthoring.ts, src/mcp/blockAuthoringShape.ts, src/mcp/blockLibraryPublish.ts, src/mcp/blockRemoval.ts, src/mcp/blockToolHandlers.ts, tests/core/constants.test.ts, tests/features/ai/mcpServer-blockAuthoringShape.test.ts, tests/features/ai/mcpServer-promoteBlock.test.ts, tests/features/ai/mcpServer-removeBlock.test.ts, tests/features/ai/mcpServer-responseSizes.test.ts, tests/features/ai/mcpServer.testUtils.ts, tests/features/ai/server/responseCeilings.ts, tests/features/eds/services/blockLibrary/storefrontBlockLibrary.test.ts, tests/features/eds/services/blockLibrary/storefrontBlockList.test.ts, tests/features/eds/services/daLive/daLiveBlockLibraryOperations-docPages.test.ts, tests/features/eds/services/daLive/daLiveBlockLibraryOperations-sheetRows.test.ts, tests/templates/block-skills.test.ts, tests/templates/spine-chokepoints.test.ts

2 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| N1 | low | Correctness: the remove docstring said a DA.live failure throws before anything changed, but the page is deleted before the row rewrite. | PROPOSE FIX | Fixed: the docstring and test comment now say it throws before the code is touched, the page may be gone, and the next Refresh Blocks writes it again. |
| N2 | low | Fit: a test name described the old order. | PROPOSE FIX | Fixed: the test name states the new order. |
