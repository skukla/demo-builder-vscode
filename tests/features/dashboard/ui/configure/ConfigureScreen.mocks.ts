/**
 * The five walls the authoring-experience and rendering suites agree on.
 *
 * IMPORTING THIS FILE REGISTERS THE MOCKS, and it must come before the suite's
 * import of ConfigureScreen — `jest.mock` hoists above the imports of the
 * module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 *
 * WHY THREE AND NOT EIGHT. Four suites here mock the same eight modules and
 * agree on far fewer than that list suggests. These three are the ones all four
 * install identically (bodies compared with comments stripped, 2026-09-02).
 * PageHeader, PageFooter and StoreConfigFieldRow differ per suite. The two
 * store-discovery hooks were briefly here and came out: `validation` mocks
 * neither, so this file would have imposed two doubles on a suite whose tree
 * uses the real hooks.
 *
 * A SUITE CANNOT OVERRIDE WHAT THIS FILE DECLARES. Whichever `jest.mock`
 * registration runs last wins, and a suite's own calls hoist to the very top —
 * so this file, imported afterwards, takes precedence. Measured directly with a
 * throwaway suite the same day. That is why the three disputed walls are absent
 * here rather than present with a suite-side override: an override would not
 * work, it would silently do nothing.
 */

import '../../../../helpers/webviewClientMock';
jest.mock('@/core/ui/hooks/useFocusTrap', () => ({
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
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
