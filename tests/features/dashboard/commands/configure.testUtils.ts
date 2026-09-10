/**
 * Shared harness for the `configure` command suite family (4 suites).
 *
 * MEASURED 2026-08-31 — three mocks appeared in every suite and only one earns
 * its place:
 *
 *   jest.mock('vscode')          REDUNDANT. `jest.config.js` already maps
 *                                `^vscode$` to `tests/__mocks__/vscode.ts` through
 *                                moduleNameMapper, in both projects. The automock
 *                                line does nothing, and all 31 tests pass without
 *                                it in any of the four.
 *   jest.mock('@/core/state')    DEAD. Every suite builds its own StateManager
 *                                fake and hands it to the command; nothing reads
 *                                the automocked module.
 *   ComponentRegistryManager     NEEDED (one test fails without it) — kept, here.
 *
 *   jest.mock('@/core/logging')  DEAD TOO, and it was the most-copied of the lot:
 *                                present in all four suites in four slightly
 *                                different spellings — two carried `trace`, two
 *                                did not, and the `Logger` class stub varied only
 *                                in formatting. I moved it here as the union
 *                                before probing it, then measured: 31 tests pass
 *                                with it gone. Four copies of a mock nothing
 *                                needed. Deleted.
 *
 * So this file holds one automock and the subject import. That is a thin harness
 * for a four-suite family, and it is the honest amount: the duplication was real,
 * but most of it was duplicated NOTHING.
 *
 * WHAT STAYS LOCAL. `@/features/eds`, `edsHelpers` and `showDashboard` are mocked
 * by two or three suites each with genuinely different return values — one suite
 * scripts a storefront-staleness result, another a republish outcome. A shared
 * default would be a value every test overrode.
 *
 * @see tests/sop/test-family-setup.test.ts
 */


jest.mock('@/features/components/services/ComponentRegistryManager');

// Below the factories on purpose — they hoist above it, so the command binds to
// the mocked modules. `import/first` is not a registered eslint rule here.
export { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
