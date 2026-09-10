/**
 * Shared setup for the codePatchPipelineHelpers suites.
 *
 * Both suites drive the same two wrappers through a faked `global.fetch`: the
 * patch ledger is read over the network, and the canonical phase fetches each
 * target from the template repo the same way. What they share is the ledger
 * source they name, the logger they hand in, and the save/restore of the real
 * `fetch` — not mocks. There is no `jest.mock` here on purpose: a `jest.mock`
 * only hoists above the imports of the file it is written in, so moving one
 * into a shared module registers it too late.
 */

import { _clearCodePatchCacheForTests } from '@/features/eds/services/patches/codePatchRegistry';
import type { CodePatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

/** The external patch ledger both suites read from. */
export const SOURCE: CodePatchSource = {
    owner: 'skukla',
    repo: 'eds-demo-patches',
    path: 'citisignal',
};

export const mockLogger: Logger = createMockLogger();

/**
 * Replace `global.fetch` with a bare mock for each test and restore the real one
 * afterwards, clearing the module-level patch-ledger cache in between so one
 * test's ledger never answers the next test's fetch.
 *
 * Call it once at the top level of a suite file; it registers the hooks itself.
 */
export function installCodePatchFetchLifecycle(): void {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        _clearCodePatchCacheForTests();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });
}
