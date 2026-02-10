/**
 * Unit Tests: DataSourceConfigStep
 *
 * Tests for the DA.live site auto-derivation step.
 * The component auto-derives the DA.live site name from the GitHub repository name
 * and checks if the site already exists in the DA.live organization.
 *
 * Uses SingleColumnLayout + StatusDisplay pattern (matching DaLiveSetupStep connected state).
 *
 * Coverage:
 * - Loading states
 * - Auto-derived site display (StatusDisplay)
 * - Site existence detection (existing vs new)
 * - Reset content option for existing sites
 * - Error state
 * - Navigation state (setCanProceed)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
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
    <Provider theme={defaultTheme} colorScheme="light">
        {children}
    </Provider>
);

// Sample site data (includes a site matching the repo name)
const mockSites: DaLiveSiteItem[] = [
    { id: 'site-1', name: 'site-alpha', lastModified: '2025-01-15T10:00:00Z' },
    { id: 'my-repo', name: 'my-repo', lastModified: '2025-01-14T10:00:00Z' },
    { id: 'site-3', name: 'demo-store', lastModified: '2025-01-13T10:00:00Z' },
];

// Sites that do NOT include the repo name
const mockSitesNoMatch: DaLiveSiteItem[] = [
    { id: 'site-1', name: 'site-alpha', lastModified: '2025-01-15T10:00:00Z' },
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
        repoName: 'my-repo',
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
        it('should show loading indicator while checking sites', async () => {
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

            expect(screen.getByText(/Checking DA.live sites.../i)).toBeInTheDocument();
            expect(screen.getByText(/Looking for "my-repo" in test-org/i)).toBeInTheDocument();
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

    describe('Auto-Derived Site Display', () => {
        it('should display org/site path in StatusDisplay after loading', async () => {
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
                // StatusDisplay title shows org/site path
                expect(screen.getByText('test-org/my-repo')).toBeInTheDocument();
            });
        });

        it('should auto-set daLiveSite to repoName', async () => {
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
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        edsConfig: expect.objectContaining({
                            daLiveSite: 'my-repo',
                        }),
                    })
                );
            });
        });
    });

    describe('Site Existence Detection', () => {
        it('should show success variant when site exists in org', async () => {
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

            // Sites include 'my-repo' — matches repoName
            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(screen.getByText(/Existing site found/i)).toBeInTheDocument();
            });
        });

        it('should show info variant when site does not exist in org', async () => {
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

            // Sites do NOT include 'my-repo'
            await simulateSitesResponse(mockSitesNoMatch);

            await waitFor(() => {
                expect(screen.getByText(/will be created during setup/i)).toBeInTheDocument();
            });
        });

        it('should enable Continue once site existence check completes', async () => {
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
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should enable Continue for new sites too', async () => {
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

            await simulateSitesResponse(mockSitesNoMatch);

            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });
    });

    describe('Reset Content Option', () => {
        it('should show reset content checkbox for existing sites', async () => {
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

            // Sites include 'my-repo'
            await simulateSitesResponse(mockSites);

            await waitFor(() => {
                expect(screen.getByText(/Reset content/i)).toBeInTheDocument();
            });
        });

        it('should NOT show reset content checkbox for new sites', async () => {
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

            // Sites do NOT include 'my-repo'
            await simulateSitesResponse(mockSitesNoMatch);

            await waitFor(() => {
                expect(screen.getByText(/will be created during setup/i)).toBeInTheDocument();
            });

            expect(screen.queryByText(/Reset content/i)).not.toBeInTheDocument();
        });

        it('should update state when reset content checkbox is toggled', async () => {
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
                expect(screen.getByText(/Reset content/i)).toBeInTheDocument();
            });

            // Toggle the checkbox
            const checkbox = screen.getByRole('checkbox', { name: /Reset content/i });
            fireEvent.click(checkbox);

            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalledWith(
                    expect.objectContaining({
                        edsConfig: expect.objectContaining({
                            resetSiteContent: true,
                        }),
                    })
                );
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
                expect(screen.getByText(/Error Checking Sites/i)).toBeInTheDocument();
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
});
