/**
 * The three walls the configService and recovery phase suites agree on.
 *
 * Six files in this family mock nine modules between them. Comparing the BODIES
 * with comments stripped (2026-09-02): these three are byte-identical in the two
 * suites below, while `timeoutConfig` and `edsHelpers` differ between them and
 * `storefrontSetupPhases.blockLibraries.testUtils` carries its own version of
 * all five. So this file serves two suites and says so, rather than pulling in
 * a third that would then be stuck with doubles it did not choose — the
 * imported wall wins over a suite's own and cannot be overridden.
 *
 * IMPORT THIS BEFORE the phases under test; `jest.mock` hoists above the
 * imports of the module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 */

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest
        .fn()
        .mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] }),
}));

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn(),
}));

export {};
