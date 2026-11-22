# Resolution of review plan-links-and-moves

Date: 2026-11-22
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/core/ui/components/feedback/OperationProgressModal.tsx, src/core/vscode/withOperationProgress.ts, src/features/app-builder/services/appManagementClient.ts, src/features/data-installer/services/demoDataWipe/wipeOrders.ts, src/types/appBuilderComponents.ts, tests/core/vscode/withOperationProgress.test.ts, tests/helpers/resetRuleOrders.ts, tests/sop/modal-layouts.test.ts, tests/sop/progress-wording.test.ts, tests/sop/toolingRegistry.ts, .rptc/complete/datapack-simplification/mockups/flow/

2 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Request: a relative link to the moved ab-26z-contract-prices plan was not updated and now points at a file that no longer exists. | PROPOSE FIX | Link changed to ../../complete/ab-26z-contract-prices/sap-mapping.md; a repo-wide search for plans/<any of the 14 moved slugs> now finds nothing. |
| F2 | low | Correctness: the edited comment, which predates this change, says the client is NOT wired to any flow, but it is wired, and the plan it cites is now filed as complete. | PROPOSE FIX | Comment now says appManagementInstaller.ts resolves the base URL from the deployed action URLs (deriveAppManagementBaseUrl), and drops the plan citation. |
