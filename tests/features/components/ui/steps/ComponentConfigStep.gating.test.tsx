/**
 * ComponentConfigStep — Continue-gating on loading states.
 *
 * The Continue button must stay blocked while the step is loading: both the initial
 * component-config load (`isLoading`) AND an in-flight store-discovery fetch
 * (`isFetching`). Regression: a valid-looking form let the user click Continue while
 * store discovery was still fetching. `setCanProceed` must reflect
 * `configValid && !isLoading && !isFetching`.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ComponentConfigStep } from '@/features/components/ui/steps/ComponentConfigStep';
import { useComponentConfig } from '@/features/components/ui/hooks/useComponentConfig';
import { useStoreDiscovery } from '@/features/components/ui/hooks/useStoreDiscovery';

// ── Per-test fixtures (set before render) ───────────────────────────────────
let configValidFixture = true;
let isLoadingFixture = false;
let isFetchingFixture = false;

jest.mock('@/features/components/ui/hooks/useComponentConfig', () => ({
    useComponentConfig: jest.fn(),
}));
jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: jest.fn(),
}));
jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: () => ({ autoDetectKey: undefined }),
}));
jest.mock('@/features/components/ui/hooks/useConfigNavigation', () => ({
    useConfigNavigation: () => ({
        expandedNavSections: {},
        activeSection: undefined,
        activeField: undefined,
        toggleNavSection: jest.fn(),
        navigateToField: jest.fn(),
        getSectionCompletion: () => ({ complete: 0, total: 0 }),
        isFieldComplete: () => false,
    }),
}));
// Keep render light — the gate lives in the parent, not these children.
jest.mock('@/features/components/ui/components/ConfigNavigationPanel', () => ({
    ConfigNavigationPanel: () => <div data-testid="nav" />,
}));
jest.mock('@/features/components/ui/components/ServiceGroupList', () => ({
    ServiceGroupList: () => <div data-testid="groups" />,
}));
jest.mock('@/core/ui/components/layout/ContentWithSidebar', () => ({
    ContentWithSidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const renderStep = (setCanProceed: jest.Mock) =>
    render(
        <Provider theme={defaultTheme}>
            <ComponentConfigStep
                state={{ selectedStack: 's', componentConfigs: {} } as never}
                updateState={jest.fn()}
                setCanProceed={setCanProceed}
            />
        </Provider>
    );

beforeEach(() => {
    configValidFixture = true;
    isLoadingFixture = false;
    isFetchingFixture = false;

    (useComponentConfig as jest.Mock).mockImplementation(
        ({ onValidationChange }: { onValidationChange: (v: boolean) => void }) => {
            React.useEffect(() => {
                onValidationChange(configValidFixture);
            }, [onValidationChange]);
            return {
                isLoading: isLoadingFixture,
                loadError: undefined,
                serviceGroups: [],
                validationErrors: {},
                touchedFields: new Set<string>(),
                updateField: jest.fn(),
                getFieldValue: jest.fn(() => ''),
                normalizeUrlField: jest.fn(),
            };
        }
    );
    (useStoreDiscovery as jest.Mock).mockImplementation(() => ({
        isFetching: isFetchingFixture,
        fetchError: undefined,
        hasStoreData: true,
        fetchStores: jest.fn(),
        getWebsiteItems: jest.fn(() => []),
        getStoreGroupItems: jest.fn(() => []),
        getStoreViewItems: jest.fn(() => []),
        isStoreGroup: jest.fn(() => false),
    }));
});

describe('ComponentConfigStep — Continue gating', () => {
    it('allows Continue when config is valid and nothing is loading', async () => {
        const setCanProceed = jest.fn();
        renderStep(setCanProceed);
        await waitFor(() => expect(setCanProceed).toHaveBeenLastCalledWith(true));
    });

    it('blocks Continue while store discovery is fetching (the regression)', async () => {
        isFetchingFixture = true;
        const setCanProceed = jest.fn();
        renderStep(setCanProceed);
        await waitFor(() => expect(setCanProceed).toHaveBeenLastCalledWith(false));
        expect(setCanProceed).not.toHaveBeenLastCalledWith(true);
    });

    it('blocks Continue while the component config is still loading', async () => {
        isLoadingFixture = true;
        const setCanProceed = jest.fn();
        renderStep(setCanProceed);
        await waitFor(() => expect(setCanProceed).toHaveBeenLastCalledWith(false));
    });

    it('blocks Continue when the config is invalid, even when idle', async () => {
        configValidFixture = false;
        const setCanProceed = jest.fn();
        renderStep(setCanProceed);
        await waitFor(() => expect(setCanProceed).toHaveBeenLastCalledWith(false));
    });
});
