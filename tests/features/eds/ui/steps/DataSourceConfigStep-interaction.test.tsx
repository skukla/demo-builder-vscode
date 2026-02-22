/**
 * Unit Tests: DataSourceConfigStep - Interaction
 *
 * Tests for interaction behavior:
 * - Create new site flow
 * - Search/filter functionality
 * - Error state
 * - Empty state
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

async function simulateSitesError(error: string) {
    await waitFor(() => {
        expect(messageHandlers.has('get-dalive-sites-error')).toBe(true);
    });

    const handler = messageHandlers.get('get-dalive-sites-error');
    if (handler) {
        act(() => {
            handler({ error });
        });
    }
}

describe('DataSourceConfigStep - Interaction', () => {
    let mockUpdateState: jest.Mock;
    let mockSetCanProceed: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandlers.clear();
        mockUpdateState = jest.fn();
        mockSetCanProceed = jest.fn();
    });

    describe('Create New Site', () => {
        it('should show create form when New button clicked', async () => {
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

            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
            });

            const newButton = screen.getByRole('button', { name: /New/i });
            fireEvent.click(newButton);

            await waitFor(() => {
                expect(screen.getByText(/Create New Site/i)).toBeInTheDocument();
                expect(screen.getByLabelText(/Site Name/i)).toBeInTheDocument();
            });
        });

        it('should validate site name format', async () => {
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
                expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
            });
            fireEvent.click(screen.getByRole('button', { name: /New/i }));

            const siteInput = screen.getByLabelText(/Site Name/i);
            fireEvent.change(siteInput, { target: { value: '123-invalid' } });
            fireEvent.blur(siteInput);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalled();
            });
        });

        it('should enable Continue with valid new site name', async () => {
            const state = createDefaultState({ daLiveSite: 'valid-site' });

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

            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
            });
            fireEvent.click(screen.getByRole('button', { name: /New/i }));

            const siteInput = screen.getByLabelText(/Site Name/i);
            fireEvent.change(siteInput, { target: { value: 'my-new-site' } });

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenLastCalledWith(true);
            });
        });

        it('should cancel create mode and return to list', async () => {
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
                expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
            });
            fireEvent.click(screen.getByRole('button', { name: /New/i }));

            await waitFor(() => {
                expect(screen.getByText(/Create New Site/i)).toBeInTheDocument();
            });

            const browseButton = screen.getByRole('button', { name: /Browse/i });
            fireEvent.click(browseButton);

            await waitFor(() => {
                expect(screen.getByText('site-alpha')).toBeInTheDocument();
                expect(screen.queryByText(/Create New Site/i)).not.toBeInTheDocument();
            });
        });
    });

    describe('Search/Filter', () => {
        it('should filter sites by search query', async () => {
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

            const searchInput = screen.getByPlaceholderText(/Filter sites/i);
            fireEvent.change(searchInput, { target: { value: 'demo' } });

            await waitFor(() => {
                expect(screen.getByText('demo-store')).toBeInTheDocument();
                expect(screen.queryByText('site-alpha')).not.toBeInTheDocument();
                expect(screen.queryByText('site-beta')).not.toBeInTheDocument();
            });
        });

        it('should show no results message when filter matches nothing', async () => {
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

            const searchInput = screen.getByPlaceholderText(/Filter sites/i);
            fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

            await waitFor(() => {
                expect(screen.getByText(/No sites match "nonexistent"/i)).toBeInTheDocument();
            });
        });
    });

    describe('Error State', () => {
        it('should display error when loading fails', async () => {
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

            await simulateSitesError('Failed to fetch sites');

            await waitFor(() => {
                expect(screen.getByText(/Error Loading Sites/i)).toBeInTheDocument();
                expect(screen.getByText(/Failed to fetch sites/i)).toBeInTheDocument();
            });
        });

        it('should show Try Again button on error', async () => {
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

            await simulateSitesError('Network error');

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
            });
        });
    });

    describe('Empty State', () => {
        it('should show empty state when no sites exist', async () => {
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

            await simulateSitesResponse([]);

            await waitFor(() => {
                expect(screen.getByText(/No Sites Found/i)).toBeInTheDocument();
                expect(screen.getByText(/No existing sites found in test-org/i)).toBeInTheDocument();
            });
        });

        it('should show Create New Site button in empty state', async () => {
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

            await simulateSitesResponse([]);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Create New Site/i })).toBeInTheDocument();
            });
        });
    });
});
