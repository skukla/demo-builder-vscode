/**
 * Shared harness for the `deployMesh` command suite family (5 suites).
 *
 * MEASURED 2026-08-31 — every mock the five suites share, deleted from all of them
 * and the family re-run:
 *
 *   fs/promises                 NEEDED — all 23 tests fail without it
 *   @/core/di/serviceLocator    NEEDED — all 23 fail
 *   showDashboard               NEEDED — 8 fail
 *   stalenessDetector           NEEDED — 4 fail
 *   ensureProjectAdobeContext   NEEDED — 8 fail
 *   vscode                      DEAD in all five
 *   meshConfig                  DEAD in all five
 *   errorFormatter              DEAD in four
 *   meshDeploymentVerifier      DEAD in three
 *
 * Seventeen dead mock declarations, deleted rather than moved. The `vscode` one is
 * the same finding as the configure family: `jest.config.js` already maps `^vscode$`
 * to `tests/__mocks__/vscode.ts` through moduleNameMapper, so the automock line does
 * nothing — and five more copies of it were sitting here.
 *
 * WHAT MOVED HERE. The ServiceLocator automock every suite needs, plus the subject
 * import that lets it hoist correctly.
 *
 * `fs/promises` did NOT move, and the reason is a hard constraint rather than a
 * preference: each spec imports `fs/promises` itself to drive `access` and
 * `readFile`, and a `jest.mock` only hoists above the imports of the module it
 * appears in. Moved here it applied too late — the specs had already bound the real
 * module — and all 23 tests failed on `access.mockResolvedValue is not a function`.
 * It stays one line in each spec, with that reason written beside it.
 *
 * The rule this makes concrete: a shared harness can own a mock for a module the
 * SUBJECT imports, but not for one the SPEC imports.
 *
 * WHAT STAYED LOCAL, and why. `showDashboard` and `stalenessDetector` are load-bearing
 * AND differ per suite — two and three spellings respectively, each scripting a
 * different return for the scenario that suite drives. `ensureProjectAdobeContext` is
 * shared by only two of the five. A shared factory for any of them would be a union
 * every test then re-scripted, which is the duplication back in a place that looks
 * tidier.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

jest.mock('@/core/di/serviceLocator');

// Below the automock on purpose — it hoists above this, so the command binds to the
// mocked module. `import/first` is not a registered eslint rule here.
export { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
