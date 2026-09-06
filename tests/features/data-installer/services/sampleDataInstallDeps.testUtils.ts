/**
 * Shared harness for the `sampleDataInstallDeps` suite family (2 suites).
 *
 * MEASURED 2026-09-06 — the mock both suites carried, deleted from both and the
 * family re-run:
 *
 *   @/core/shell/pollingService   DEAD in both — 27 tests, all still green
 *
 * It was there with a comment saying `PollingService`'s constructor calls
 * `getLogger()` and throws unless the extension has activated. It does not, and
 * `watch` constructs one on every call, so the claim was checkable and false.
 * Deleted rather than moved.
 *
 * WHAT MOVED HERE. The handler context both suites build, and the ACCS project
 * shape both drive the deps with. Nothing else: every remaining `jest.mock` in
 * these suites is for a module the SPEC itself imports — `commerceCredentials`,
 * `dataInstallerHandlers`, `dataInstallerWriteClient`, `importJobRunner` — and a
 * `jest.mock` only hoists above the imports of the module it appears in. Moved
 * here they would apply too late and each spec would hold the real function it
 * means to assert on.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

/**
 * A context with a real debug logger fake — the write client logs one line per
 * service call through it, and an absent one aborts the closure into a catch
 * while every test still passes.
 */
export function importHarness(overrides: Partial<HandlerContext> = {}): HandlerContext {
    return createMockHandlerContext({ debugLogger: createMockLogger(), ...overrides });
}

/** An ACCS project, in the shape the credential resolver dispatches on. */
export const ACCS_PROJECT = {
    name: 'demo',
    adobe: { organization: '285361' },
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: {},
};

/** The refusal both the write client and the poller give when access fails. */
export const NOT_REACHABLE = 'The Data Installer is not reachable for this project.';
