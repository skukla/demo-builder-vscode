# Resolution of review plan-moves-batch-two

Date: 2026-11-22
Reviewer: rptc:code-review-agent
Model: opus
Scope: .pipeline.yaml, src/core/errors/index.ts, src/core/utils/storefrontJobs.ts, src/features/data-installer/handlers/importTargetHandlers.ts, src/features/data-installer/handlers/packSave.ts, src/features/data-installer/services/demoDataWipe/wipeOrderRun.ts, src/features/data-installer/services/demoDataWipe/wipeOrders.ts, src/features/data-installer/services/demoPack.ts, tests/core/utils/storefrontJobs.test.ts, tests/features/data-installer/handlers/datapackLibraryHandlers-deleteOwn.test.ts, tests/features/data-installer/handlers/storeChangesHandlers.test.ts, tests/features/data-installer/services/demoDataWipe/wipeOrders.test.ts, tests/features/data-installer/services/demoPack.test.ts, tests/features/data-installer/ui/components/create-flow/createDatapackPicks.test.tsx, tests/features/data-installer/ui/views/DatapackCatalogView-storeChanges.test.tsx, tests/helpers/resetRuleOrders.ts, tests/sop/progress-steps.test.ts, tests/sop/user-facing-errors.ledger.json

1 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Correctness: the edited comments in wipeOrders.ts:7-8 and wipeOrderRun.ts:4-5 (and wipeOrderRun.ts's invoice table row) still say the ERP integration lacks the 2026-11-11 rule and invoice and that step 6 is the pending live check, but the plan they now cite as complete records step 6 passed live with the integration deployed; the stale claim was there before this change, which rewrote the same lines and kept it. | PROPOSE FIX | Both comments and the invoice row rewritten after confirming on commerce-erp-integration origin/main that reset-rule.js has the 2026-11-11 rule and close-orders.js invoices (d17e9f7). A re-review then found the note and refund rows stale too; fixed and re-reviewed clean. |
