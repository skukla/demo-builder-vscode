/**
 * The three walls the base and sections ConnectStoreStepContent suites agree on.
 *
 * MEASURED, AND THE NUMBER IS THE POINT. Four files in this family mock five
 * modules between them. Comparing the BODIES with comments stripped
 * (2026-09-02) shows only ONE wall — StoreSelectionRow — identical across all
 * three test suites; `advanced` carries its own LoadingDisplay,
 * ConfigFieldRenderer, useComponentConfig and useStoreDiscovery. So this file
 * serves two suites, not three, and `advanced` deliberately does not import it.
 *
 * An earlier attempt at this family extracted on module NAMES rather than
 * bodies and broke six tests; it was reverted the same day. That is why the
 * table above was rebuilt before anything moved.
 *
 * IMPORT THIS BEFORE the component under test — `jest.mock` hoists above the
 * imports of the module it appears in, not across modules. And note that a
 * suite CANNOT override what this file declares: the imported wall registers
 * last and wins.
 */

import type { MockServiceGroup } from './ConnectStoreStepContent.testUtils';

/**
 * The hook state both suites mutate per test, then assert through.
 *
 * These live here rather than in each suite because the walls below CLOSE OVER
 * them — a wall in a shared file cannot reach a handle a suite declares. Both
 * suites had a byte-identical copy of both objects. Mutate the fields in a
 * `beforeEach`; the walls hand the same object back every render.
 */
export const mockUseComponentConfig = {
    isLoading: false,
    loadError: null as string | null,
    serviceGroups: [] as MockServiceGroup[],
    validationErrors: {} as Record<string, string>,
    touchedFields: new Set<string>(),
    componentConfigs: {} as Record<string, Record<string, string | boolean>>,
    updateField: jest.fn(),
    getFieldValue: jest.fn().mockReturnValue(''),
    normalizeUrlField: jest.fn(),
};

export const mockUseStoreDiscovery = {
    isFetching: false,
    fetchError: null as string | null,
    hasStoreData: false,
    fetchStores: jest.fn(),
    getWebsiteItems: jest.fn().mockReturnValue([]),
    getStoreGroupItems: jest.fn().mockReturnValue([]),
    getStoreViewItems: jest.fn().mockReturnValue([]),
    isStoreGroup: jest.fn((groupId: string) => groupId === 'accs' || groupId === 'adobe-commerce'),
};

// Mock StoreSelectionRow
jest.mock('@/features/components/ui/components/StoreSelectionRow', () => ({
    StoreSelectionRow: ({ group }: any) => (
        <div data-testid={`store-selection-row-${group.id}`}>
            Store Selection for {group.label}
        </div>
    ),
}));

jest.mock('@/features/components/ui/hooks/useComponentConfig', () => ({
    useComponentConfig: () => mockUseComponentConfig,
    // Re-export types
    __esModule: true,
}));

jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: () => mockUseStoreDiscovery,
}));

export {};
