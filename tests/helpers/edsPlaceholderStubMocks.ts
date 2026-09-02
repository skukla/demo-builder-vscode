/**
 * The six stub walls both EDS placeholder-stub suites install identically.
 *
 * `storefrontSetupPhase2.placeholderStubs` (a setup phase) and
 * `edsResetRepoHelper.placeholderStubs` (the reset path) both assert that the
 * placeholder content a storefront ships with is stubbed rather than published.
 * They live in different features, so this sits in `tests/helpers/` rather than
 * either feature's directory — a feature's tests must not reach into another's.
 *
 * Six of their ten walls are byte-identical with comments stripped (measured
 * 2026-09-02). The other four are each suite's own: `edsHelpers` for the setup
 * phase, and `configGenerator`, `codePatchPipelineHelpers` and `lkgReader` for
 * reset. They stay put — the imported wall wins over a suite's own, so a shared
 * file must hold only what every consumer agrees on.
 *
 * IMPORT THIS BEFORE the code under test; `jest.mock` hoists above the imports
 * of the module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 */

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    getBlockLibraryContentSource: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest
        .fn()
        .mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] }),
}));

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mock-fstab'),
}));

jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    generateInspectorTreeEntries: jest.fn().mockResolvedValue([]),
    installInspectorTagging: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/eds/services/pdp/pdp404HandlerPublisher', () => ({
    installSmart404Handler: jest.fn().mockResolvedValue({ installed: false, reason: 'no-overlay' }),
}));

jest.mock('@/features/eds/services/quickEditPublisher', () => ({
    installQuickEdit: jest.fn().mockResolvedValue({ installed: true }),
}));

export {};
