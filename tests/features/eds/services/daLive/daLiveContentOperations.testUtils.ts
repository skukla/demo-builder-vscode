/**
 * Shared setup for the daLiveContentOperations suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   daLiveContentOperations-blockDocPages.test.ts
 *   daLiveContentOperations-enumeration.test.ts
 *   daLiveContentOperations-library-cdnCopy.test.ts
 *   daLiveContentOperations-library-creation.test.ts
 *   daLiveContentOperations-transform.test.ts
 *   daLiveContentOperations-utils.test.ts
 */

// Mock the timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));
// Mock global fetch
const mockFetch = jest.fn();


export {
    mockFetch,
};
