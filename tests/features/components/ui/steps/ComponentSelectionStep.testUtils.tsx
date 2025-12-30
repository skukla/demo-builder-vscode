import { WizardState } from '@/types/webview';

/**
 * Mock WebviewClient
 */
export const mockPostMessage = jest.fn();
export const mockOnMessage = jest.fn(() => jest.fn());

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: mockOnMessage,
    },
}));

/**
 * Test utilities and factories for ComponentSelectionStep tests
 */

export const mockUpdateState = jest.fn();
export const mockSetCanProceed = jest.fn();

export const baseState: Partial<WizardState> = {
    currentStep: 'component-selection',
    components: undefined,
};

export const mockComponentsData = {
    frontends: [
        { id: 'headless', name: 'Headless CitiSignal', description: 'NextJS storefront' }
    ],
    backends: [
        { id: 'adobe-commerce-paas', name: 'Adobe Commerce PaaS', description: 'Commerce DSN' }
    ],
    integrations: [
        { id: 'experience-platform', name: 'Experience Platform', description: 'Adobe Experience Platform' }
    ],
    appBuilder: [
        { id: 'integration-service', name: 'Integration Service', description: 'Custom service' }
    ]
};

/**
 * Factory function for creating state with frontend selection
 * CRITICAL: Returns a function to ensure fresh state on each call
 */
export const createStateWithFrontend = () => ({
    ...baseState,
    components: {
        frontend: 'headless',
        backend: '',
        dependencies: ['commerce-mesh'],
        services: [],
        integrations: [],
        appBuilder: []
    }
});

/**
 * Factory function for creating state with backend selection
 * CRITICAL: Returns a function to ensure fresh state on each call
 */
export const createStateWithBackend = () => ({
    ...baseState,
    components: {
        frontend: '',
        backend: 'adobe-commerce-paas',
        dependencies: [],
        services: ['catalog-service', 'live-search'],
        integrations: [],
        appBuilder: []
    }
});

/**
 * Factory function for creating state with both selections
 * CRITICAL: Returns a function to ensure fresh state on each call
 */
export const createStateWithSelections = () => ({
    ...baseState,
    components: {
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
        dependencies: ['commerce-mesh'],
        services: ['catalog-service', 'live-search'],
        integrations: [],
        appBuilder: []
    }
});

/**
 * Factory function for creating state with no frontend
 * CRITICAL: Returns a function to ensure fresh state on each call
 */
export const createStateNoFrontend = () => ({
    ...baseState,
    components: {
        frontend: '',
        backend: 'adobe-commerce-paas',
        dependencies: [],
        services: ['catalog-service', 'live-search'],
        integrations: [],
        appBuilder: []
    }
});

/**
 * Factory function for creating state with no backend
 * CRITICAL: Returns a function to ensure fresh state on each call
 */
export const createStateNoBackend = () => ({
    ...baseState,
    components: {
        frontend: 'headless',
        backend: '',
        dependencies: ['commerce-mesh'],
        services: [],
        integrations: [],
        appBuilder: []
    }
});

/**
 * Factory function for creating state with all components
 * CRITICAL: Returns a function to ensure fresh state on each call
 */
export const createStateWithDefaults = () => ({
    ...baseState,
    components: {
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
        dependencies: ['commerce-mesh'],
        services: ['catalog-service', 'live-search'],
        integrations: ['experience-platform'],
        appBuilder: ['integration-service']
    }
});

/**
 * Factory function for creating initial state with no selections
 * CRITICAL: Returns a function to ensure fresh state on each call
 */
export const createStateInitial = () => ({
    ...baseState,
    components: {
        frontend: '',
        backend: '',
        dependencies: [],
        services: [],
        integrations: [],
        appBuilder: []
    }
});

/**
 * Reset all mocks between tests
 */
export const resetMocks = () => {
    jest.clearAllMocks();
    mockOnMessage.mockReturnValue(jest.fn());
};
