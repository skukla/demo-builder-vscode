# Resolution of review aco-merge-fixes

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/data-installer/services/demoBuilderEngine/engineElsewhere.ts, src/features/data-installer/services/demoBuilderEngine/storeNames.ts, src/features/data-installer/services/engineActivityLog.ts, src/features/data-installer/services/demoBuilderEngine/engine.ts, src/features/project-creation/services/aiBundle/homeAiContextWriter.ts, tests/features/data-installer/services/demoBuilderEngine/engine-jobEnd.test.ts, tests/features/data-installer/services/demoBuilderEngine/engine-settingsLayer.test.ts, tests/features/data-installer/services/engineActivityLog.test.ts, tests/features/project-creation/services/aiBundle/homeAiContextWriter-tools.test.ts, tests/features/project-creation/services/aiBundle/homeAiContextWriter.testUtils.ts, src/features/data-installer/services/demoBuilderEngine/engineDeps.ts

1 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Correctness: the engineDeps.ts header still says engine.ts re-exports DemoBuilderEngineDeps and JobEnd and that callers import them from there, which the removal of that re-export made false. | PROPOSE FIX | Fixed: the engineDeps.ts header now says callers import both types from engineDeps. |
