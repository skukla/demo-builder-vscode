/**
 * useFieldFocusTracking Hook Integration Test
 *
 * Verifies that ConfigureScreen delegates field focus tracking
 * to the useFieldFocusTracking hook instead of using inline logic.
 *
 * @jest-environment jsdom
 */

import { render } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import { mockProject, mockComponentsData } from '../ConfigureScreen.testUtils';

// Track hook calls
const mockUseFieldFocusTracking = jest.fn().mockReturnValue({
    lastFocusedSectionRef: { current: null },
    fieldCountInSectionRef: { current: 0 },
});

// Mock the hook module
jest.mock('@/features/dashboard/ui/configure/hooks/useFieldFocusTracking', () => ({
    useFieldFocusTracking: (...args: unknown[]) => mockUseFieldFocusTracking(...args),
}));

// Mock hooks
jest.mock('@/core/ui/hooks', () => ({
    useSelectableDefault: jest.fn(() => ({})),
    useFocusTrap: jest.fn(() => ({ current: null })),
}));

jest.mock('@/core/ui/hooks/useSelectableDefault', () => ({
    useSelectableDefault: jest.fn(() => ({})),
}));

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

// Mock layout components
jest.mock('@/core/ui/components/layout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: any) => (
        <div>
            <div data-testid="left-column">{leftContent}</div>
            <div data-testid="right-column">{rightContent}</div>
        </div>
    ),
    PageHeader: ({ title, subtitle }: any) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <h3>{subtitle}</h3>}
        </div>
    ),
    PageFooter: ({ leftContent, rightContent }: any) => (
        <div data-testid="page-footer">
            <div>{leftContent}</div>
            <div>{rightContent}</div>
        </div>
    ),
}));

jest.mock('@/core/ui/components/layout/TwoColumnLayout', () => ({
    TwoColumnLayout: ({ leftContent, rightContent }: any) => (
        <div>
            <div data-testid="left-column">{leftContent}</div>
            <div data-testid="right-column">{rightContent}</div>
        </div>
    ),
}));

// Mock navigation components
jest.mock('@/core/ui/components/navigation', () => ({
    NavigationPanel: () => <div data-testid="navigation-panel" />,
}));

// Mock form components
jest.mock('@/core/ui/components/forms', () => ({
    ConfigSection: ({ children, label }: any) => (
        <div data-testid={`section-${label}`}>{children}</div>
    ),
}));

// Mock store discovery hooks
jest.mock('@/features/components/ui/hooks/useStoreDiscovery', () => ({
    useStoreDiscovery: () => ({
        isFetching: false,
        fetchError: null,
        hasStoreData: false,
        fetchStores: jest.fn(),
        getWebsiteItems: jest.fn(() => []),
        getStoreGroupItems: jest.fn(() => []),
        getStoreViewItems: jest.fn(() => []),
        isStoreGroup: jest.fn(() => false),
    }),
}));

jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: () => ({
        autoDetectKey: null,
        forceFetch: jest.fn(),
    }),
}));

// Mock AiConfigurationTab
jest.mock('@/features/dashboard/ui/tabs/AiConfigurationTab', () => ({
    AiConfigurationTab: () => <div data-testid="ai-setup-tab" />,
}));

const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>,
    );
};

describe('ConfigureScreen - useFieldFocusTracking integration', () => {
    beforeEach(() => {
        mockUseFieldFocusTracking.mockClear();
    });

    it('should call useFieldFocusTracking hook on render', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
            />,
        );

        expect(mockUseFieldFocusTracking).toHaveBeenCalled();
    });

    it('should pass setActiveSection to useFieldFocusTracking', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
            />,
        );

        const callArgs = mockUseFieldFocusTracking.mock.calls[0][0];
        expect(callArgs).toHaveProperty('setActiveSection');
        expect(typeof callArgs.setActiveSection).toBe('function');
    });

    it('should pass setActiveField to useFieldFocusTracking', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
            />,
        );

        const callArgs = mockUseFieldFocusTracking.mock.calls[0][0];
        expect(callArgs).toHaveProperty('setActiveField');
        expect(typeof callArgs.setActiveField).toBe('function');
    });

    it('should pass setExpandedNavSections to useFieldFocusTracking', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
            />,
        );

        const callArgs = mockUseFieldFocusTracking.mock.calls[0][0];
        expect(callArgs).toHaveProperty('setExpandedNavSections');
        expect(typeof callArgs.setExpandedNavSections).toBe('function');
    });

    it('should pass serviceGroups to useFieldFocusTracking', () => {
        renderWithProvider(
            <ConfigureScreen
                project={mockProject as any}
                componentsData={mockComponentsData}
            />,
        );

        const callArgs = mockUseFieldFocusTracking.mock.calls[0][0];
        expect(callArgs).toHaveProperty('serviceGroups');
        expect(Array.isArray(callArgs.serviceGroups)).toBe(true);
    });
});
