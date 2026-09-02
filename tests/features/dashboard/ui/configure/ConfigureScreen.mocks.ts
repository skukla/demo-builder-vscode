/**
 * The five walls the authoring-experience and rendering suites agree on.
 *
 * IMPORTING THIS FILE REGISTERS THE MOCKS, and it must come before the suite's
 * import of ConfigureScreen — `jest.mock` hoists above the imports of the
 * module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 *
 * WHY FIVE AND NOT EIGHT. Four suites in this directory mock the same eight
 * modules. Comparing the BODIES with comments stripped (2026-09-02) says they
 * agree on only some of them, and which ones depends on the pair. These two
 * agree on all five below and differ on PageHeader, PageFooter and
 * StoreConfigFieldRow, which stay in each suite.
 *
 * A SUITE CANNOT OVERRIDE WHAT THIS FILE DECLARES. Whichever `jest.mock`
 * registration runs last wins, and a suite's own calls hoist to the very top —
 * so this file, imported afterwards, takes precedence. Measured directly with a
 * throwaway suite the same day. That is why the three disputed walls are absent
 * here rather than present with a suite-side override: an override would not
 * work, it would silently do nothing.
 */

jest.mock('@/core/ui/hooks/useFocusTrap', () => ({
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
}));

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: () => ({ autoDetectKey: undefined, forceFetch: jest.fn() }),
}));

/**
 * Store discovery renders benignly here; it is exercised for real in
 * `ConfigureScreen-store-discovery.test.tsx`, which keeps its own version.
 */
jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: () => ({
        isFetching: false,
        fetchError: null,
        hasStoreData: false,
        fetchStores: jest.fn(),
        getWebsiteItems: () => [],
        getStoreGroupItems: () => [],
        getStoreViewItems: () => [],
        isStoreGroup: () => false,
    }),
}));

export {};
