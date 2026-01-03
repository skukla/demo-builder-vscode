/**
 * Unit Tests: DataSourceConfigStep
 *
 * Tests for the DA.live site selection/creation step.
 * The component uses useSelectionStep to load sites from a verified org
 * and allows users to select an existing site or create a new one.
 *
 * Coverage:
 * - Loading states
 * - Site list display
 * - Site selection
 * - Create new site flow
 * - Search/filter functionality
 * - Error state
 * - Empty state
 * - Navigation state (setCanProceed)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WizardState, EDSConfig, DaLiveSiteItem } from '@/types/webview';

// Mock webviewClient
const mockPostMessage = jest.fn();
let messageHandlers: Map<string, (data: unknown) => void> = new Map();

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
    <>
        {children}
    </>
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

// Helper to simulate message response - waits for handler to be registered
async function simulateSitesResponse(sites: DaLiveSiteItem[]) {
    // Wait for the handler to be registered (happens in useEffect after mount)
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
    // Wait for the handler to be registered
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

describe('DataSourceConfigStep', () => {
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

            // Should show loading message
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

            // Simulate sites response
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
                // Site count is displayed in the SearchHeader
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

            // Click on a site row
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

            // Click New button
            const newButton = screen.getByRole('button', { name: /New/i });
            await userEvent.click(newButton);

            // Should show create form
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

            // Click New button
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
            });
            await userEvent.click(screen.getByRole('button', { name: /New/i }));

            // Type invalid site name (starts with number)
            const siteInput = screen.getByLabelText(/Site Name/i);
            await userEvent.type(siteInput, '123-invalid');
            fireEvent.blur(siteInput);

            await waitFor(() => {
                expect(screen.getByText(/Must start with a letter/i)).toBeInTheDocument();
            });
        });

        it('should enable Continue with valid new site name', async () => {
            // Start with create mode active and valid name
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

            // Click New button
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
            });
            await userEvent.click(screen.getByRole('button', { name: /New/i }));

            // Type valid site name
            const siteInput = screen.getByLabelText(/Site Name/i);
            await userEvent.clear(siteInput);
            await userEvent.type(siteInput, 'my-new-site');

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

            // Click New, then Cancel
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
            });
            await userEvent.click(screen.getByRole('button', { name: /New/i }));

            await waitFor(() => {
                expect(screen.getByText(/Create New Site/i)).toBeInTheDocument();
            });

            const cancelButton = screen.getByRole('button', { name: /Cancel/i });
            await userEvent.click(cancelButton);

            // Should be back to list view
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

            // Type in search field
            const searchInput = screen.getByPlaceholderText(/Filter sites/i);
            await userEvent.type(searchInput, 'demo');

            // Only demo-store should be visible
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

            // Type non-matching search
            const searchInput = screen.getByPlaceholderText(/Filter sites/i);
            await userEvent.type(searchInput, 'nonexistent');

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

            // Simulate error response
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

            // Return empty sites array
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
