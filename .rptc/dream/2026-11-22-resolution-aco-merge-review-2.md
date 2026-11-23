# Resolution of review aco-merge-review-2

Date: 2026-11-22
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/data-installer/services/demoBuilderEngine/engine.ts, src/features/data-installer/services/aco/acoEngineRoutes.ts, src/features/data-installer/services/demoBuilderEngine/installRecord.ts, src/features/data-installer/services/demoDataWipe/wipeClaims.ts, src/features/data-installer/services/demoDataWipe/instanceClaims.ts, src/features/data-installer/services/demoDataWipe/instanceProjects.ts, src/features/dashboard/commands/configure.ts, src/features/dashboard/handlers/consoleApiHandlers.ts, src/features/data-installer/services/acoWebsite/scrapedProductInput.ts, tests/features/data-installer/services/demoBuilderEngine/engine-aco.test.ts, tests/features/data-installer/services/demoDataWipe/instanceClaims.test.ts

5 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: With ACO records filtered out by readCommerceRecords, decide() returns 'forget' for a project whose datapack is an ACO pack, so a full Clear Commerce Instance clears project.datapack while the pack's rows remain in ACO. | PROPOSE FIX | Fixed: readOwner reads every record once; when the project's pack has an ACO record the decision is 'nothing' (neither uninstall nor forget); the Commerce filter applies to the rest. |
| F2 | medium | Correctness: The new ACO-record test asserts only that the decision is not 'uninstall', so it passes when the decision is 'forget'. | PROPOSE FIX | Fixed: the test asserts the exact decision 'nothing'. Proven: with the fix undone it fails. |
| F3 | low | Correctness: The early saveProject after a successful ACO switch has no test that fails if it is removed. | PROPOSE FIX | Fixed: a test asserts an ACO switch saves one more time than a plain save, the first save already holding ACO on. Proven: with the early save removed it fails. |
| F4 | low | Correctness: The profilesOf path (there before the merge) awaits getServicesForOrg with no try/catch and has no test. | PROPOSE FIX | Fixed: the profilesOf answer runs inside the handler try, so a failure answers Could not list Adobe APIs like the list. Two tests: the rows and profiles, and the failure. |
| F5 | low | Fit: The change grows a file that is already oversized from 821 to 837 lines, against the 500-line file maximum. | DECLINE | configure.ts was 821 lines on develop, already over the limit; the 16 added lines are the ACO switch and its immediate save. Splitting the file is the god-file programme (EDS-8), not this merge. |
