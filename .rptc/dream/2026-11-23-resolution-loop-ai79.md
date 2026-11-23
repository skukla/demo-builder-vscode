# Resolution of review loop-ai79

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/skills/ai-coverage-scan/triage.json

4 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: the getShareDatapackCheck alias names get_demo_package_preview, which refuses every project the handler serves (it is called only when the project is not Edge Delivery), and export_demo_bundle's packNote covers only the private-pack case, so the missing-pack verdict and the custom-integration repository checks are reachable by no tool; the row should be a gap. | PROPOSE FIX | Fixed: getShareDatapackCheck moved to gaps, saying no tool answers it for a project without Edge Delivery, and naming what packNote leaves out. The scan now reports 5 real gaps. |
| F2 | low | Correctness: the runProjectsBatch reason says the batch reset is the answered reset in projectResetService, but Edge Delivery rows go through resetEdsProjectWithUI; only headless rows use runProjectResetAnswered. | PROPOSE FIX | Fixed: the reason says the batch reset uses the same two paths reset_project does (the Edge Delivery reset, or the answered reset for a headless project). |
| F3 | low | Fit: creation-pause-answer is filed as an exclusion, but continue_project_creation calls the same handler, which meets SKILL.md's definition of an alias. | PROPOSE FIX | Fixed: creation-pause-answer is an alias of continue_project_creation, citing answerPausedCreation. |
| F4 | low | Fit: the checkUpdateRows and recheckUpdates reasons call apply_updates without confirm 'the same check', but those handlers check every project (findAllUpdates) while apply_updates checks the current project only. | PROPOSE FIX | Fixed: both reasons say the handler checks every project and an agent checks one project at a time with apply_updates without confirm. |
