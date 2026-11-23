# Resolution of review loop-pl98

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/projects-dashboard/ui/components/BatchQuestionTable.tsx, src/features/projects-dashboard/ui/components/BatchDeleteQuestions.tsx, src/features/projects-dashboard/ui/components/BatchResetQuestions.tsx, src/features/projects-dashboard/ui/components/UpdatesModal.tsx

2 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Correctness: no test pins that Reset Selected draws no table head when no project has a datapack, so a shell that always rendered the 'Project' head would pass; the gap predates the change, but the change moves that decision into the new columns !== undefined check. | PROPOSE FIX | Fixed: the test now also asserts queryByText('Project') is null. With BatchQuestionTable's head condition replaced by `true`, that test fails (1 failed, 17 passed); restored, it passes. |
| F2 | low | Fit: the new exported component declares no return type, unlike every sibling exported component, which declares React.ReactElement. | PROPOSE FIX | Fixed: BatchQuestionTable declares React.ReactElement. Also changed after the review: the full checks failed on stylesheet-bundles' dynamicClassSiteCeiling (21 to 22) because the table class was a template string, so it is now cn('batch-delete-table', className), and the extra-classes prop is named className so the class reader still sees the callers' batch-delete-spread and updates-table. stylesheet-bundles and the 978 projects-dashboard tests pass. |
