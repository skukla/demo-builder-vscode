/**
 * Unit Tests: DataSourceConfigStep - Display
 *
 * Tests for display-related behavior:
 * - Loading states
 * - Site list display
 * - Site selection
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import type { WizardState, EDSConfig, DaLiveSiteItem } from '@/types/webview';

// Mock webviewClient
const mockPostMessage = jest.fn();
const messageHandlers: Map<string, (data: unknown) => void> = new Map();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        onMessage: (type: string, handler: (data: unknown) => void) => {
            messageHandlers.set(type, handler);
            return () => messageHandlers.delete(type);
        },
        ready: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock webviewLogger
jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Test wrapper with Spectrum provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider theme={defaultTheme} colorScheme="light">
        {children}
    </Provider>
);

// Sample site data
const mockSites: DaLiveSiteItem[] = [
    { id: 'site-1', name: 'site-alpha', lastModified: '2025-01-15T10:00:00Z' },
    { id: 'site-2', name: 'site-beta', lastModified: '2025-01-14T10:00:00Z' },
    { id: 'site-3', name: 'demo-store', lastModified: '2025-01-13T10:00:00Z' },
];

// Default wizard state for EDS configuration
const createDefaultState = (overrides?: Partial<EDSConfig>): WizardState => ({
    currentStep: 'datasource',
    projectName: 'test-project',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    componentConfigs: {},
    edsConfig: {
        accsHost: '',
        storeViewCode: '',
        customerGroup: '',
        repoName: '',
        daLiveOrg: 'test-org',
        daLiveSite: '',
        ...overrides,
    },
});

// Stateful test component that manages state updates
interface StatefulWrapperProps {
    initialState: WizardState;
    setCanProceed: jest.Mock;
    onUpdateState?: jest.Mock;
    children: (props: {
        state: WizardState;
        updateState: (updates: Partial<WizardState>) => void;
        setCanProceed: jest.Mock;
    }) => React.ReactNode;
}

const StatefulWrapper: React.FC<StatefulWrapperProps> = ({
    initialState,
    setCanProceed,
    onUpdateState,
    children,
}) => {
    const [state, setState] = React.useState(initialState);

    const updateState = React.useCallback((updates: Partial<WizardState>) => {
        setState(prev => ({ ...prev, ...updates }));
        if (onUpdateState) {
            onUpdateState(updates);
        }
    }, [onUpdateState]);

    return <>{children({ state, updateState, setCanProceed })}</>;
};

// Helper to simulate message response
async function simulateSitesResponse(sites: DaLiveSiteItem[]) {
    await waitFor(() => {
        expect(messageHandlers.has('get-dalive-sites')).toBe(true);
    });

    const handler = messageHandlers.get('get-dalive-sites');
    if (handler) {
        act(() => {
            handler(sites);
        });
    }
}

describe('DataSourceConfigStep - Display', () => {
    let mockUpdateState: jest.Mock;
    let mockSetCanProceed: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers.clear();
        mockUpdateState = jest.fn();
        mockSetCanProceed = jest.fn();
    });

    describe('Loading States', () => {
        it('should show loading indicator while fetching sites', async () => {
            const state = createDefaultState();

            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            expect(screen.getByText(/Loading sites.../i)).toBeInTheDocument();
            expect(screen.getByText(/Fetching sites from test-org/i)).toBeInTheDocument();
        });

        it('should request sites on mount when org is available', async () => {
            const state = createDefaultState();

            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            await waitFor(() => {
                expect(mockPostMessage).toHaveBeenCalledWith('get-dalive-sites', { orgName: 'test-org' });
            });
        });
    });

    describe('Site List Display', () => {
        it('should display site list after loading', async () => {
            const initialState = createDefaultState();

            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <StatefulWrapper
                        initialState={initialState}
                        setCanProceed={mockSetCanProceed}
                        onUpdateState={mockUpdateState}
                    >
                        {({ state, updateState, setCanProceed }) => (
                            <DataSourceConfigStep
                                state={state}
                                updateState={updateState}
                                setCanProceed={setCanProceed}
                            />
                        )}
                    </StatefulWrapper>
                </TestWrapper>
            );

            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(screen.getByText('site-alpha')).toBeInTheDocument();
                expect(screen.getByText('site-beta')).toBeInTheDocument();
                expect(screen.getByText('demo-store')).toBeInTheDocument();
            });
        });

        it('should display site count in header', async () => {
            const initialState = createDefaultState();

            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <StatefulWrapper
                        initialState={initialState}
                        setCanProceed={mockSetCanProceed}
                        onUpdateState={mockUpdateState}
                    >
                        {({ state, updateState, setCanProceed }) => (
                            <DataSourceConfigStep
                                state={state}
                                updateState={updateState}
                                setCanProceed={setCanProceed}
                            />
                        )}
                    </StatefulWrapper>
                </TestWrapper>
            );

            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(screen.getByText(/3 sites/i)).toBeInTheDocument();
            });
        });
    });

    describe('Site Selection', () => {
        it('should update state when site is selected', async () => {
            const initialState = createDefaultState();

            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <StatefulWrapper
                        initialState={initialState}
                        setCanProceed={mockSetCanProceed}
                        onUpdateState={mockUpdateState}
                    >
                        {({ state, updateState, setCanProceed }) => (
                            <DataSourceConfigStep
                                state={state}
                                updateState={updateState}
                                setCanProceed={setCanProceed}
                            />
                        )}
                    </StatefulWrapper>
                </TestWrapper>
            );

            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(screen.getByText('site-alpha')).toBeInTheDocument();
            });

            const siteRow = screen.getByText('site-alpha');
            fireEvent.click(siteRow);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        edsConfig: expect.objectContaining({
                            daLiveSite: 'site-alpha',
                            selectedSite: expect.objectContaining({ name: 'site-alpha' }),
                        }),
                    })
                );
            });
        });

        it('should enable Continue when site is selected', async () => {
            const initialState = createDefaultState({
                selectedSite: mockSites[0],
                daLiveSite: 'site-alpha',
            });

            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <StatefulWrapper
                        initialState={initialState}
                        setCanProceed={mockSetCanProceed}
                        onUpdateState={mockUpdateState}
                    >
                        {({ state, updateState, setCanProceed }) => (
                            <DataSourceConfigStep
                                state={state}
                                updateState={updateState}
                                setCanProceed={setCanProceed}
                            />
                        )}
                    </StatefulWrapper>
                </TestWrapper>
            );

            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should disable Continue when no site is selected', async () => {
            const initialState = createDefaultState();

            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <StatefulWrapper
                        initialState={initialState}
                        setCanProceed={mockSetCanProceed}
                        onUpdateState={mockUpdateState}
                    >
                        {({ state, updateState, setCanProceed }) => (
                            <DataSourceConfigStep
                                state={state}
                                updateState={updateState}
                                setCanProceed={setCanProceed}
                            />
                        )}
                    </StatefulWrapper>
                </TestWrapper>
            );

            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });
    });
});
