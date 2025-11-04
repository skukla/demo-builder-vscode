/**
 * Tests for ComponentSelectionStep - Pattern B (request-response)
 *
 * Tests verify that the component fetches data on mount using vscode.request()
 * instead of receiving it as props, following the request-response pattern.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { vscode } from '@/webview-ui/shared/vscode-api';
import { createMockVSCode, mockSuccessfulRequest, mockFailedRequest } from '../../../../utils/webviewMocks';

// Mock vscode API (use factory function to avoid hoisting issues)
jest.mock('@/core/ui/vscode-api', () => ({
    vscode: {
        request: jest.fn(),
        postMessage: jest.fn(),
        onMessage: jest.fn(() => () => {}),
        ready: jest.fn(() => Promise.resolve()),
    },
}));

describe('ComponentSelectionStep - Pattern B (request-response)', () => {
    let mockVscode: ReturnType<typeof createMockVSCode>;

    beforeEach(() => {
        mockVscode = vscode as any;
        jest.clearAllMocks();
    });

    const mockState = {
        components: {
            frontend: '',
            backend: '',
            dependencies: [],
            services: [],
            integrations: [],
            appBuilderApps: [],
        },
    } as any;

    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    describe('Data fetching on mount', () => {
        it('should fetch components data on mount using vscode.request()', async () => {
            // Arrange: Mock successful component data response
            const mockComponentsData = {
                frontends: [
                    { id: 'f1', name: 'Frontend 1', description: 'Frontend description' },
                ],
                backends: [
                    { id: 'b1', name: 'Backend 1', description: 'Backend description' },
                ],
                integrations: [],
                appBuilder: [],
                dependencies: [],
                envVars: {},
            };

            mockSuccessfulRequest(mockVscode, mockComponentsData);

            // Act: Render component with Provider wrapper
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={mockState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Assert: Verify vscode.request was called
            await waitFor(() => {
                expect(mockVscode.request).toHaveBeenCalledWith('get-components-data');
            });

            // Verify component options are rendered from fetched data
            await waitFor(() => {
                expect(screen.getByText('Frontend 1')).toBeInTheDocument();
            });
        });

        it('should show loading state while fetching components', async () => {
            // Arrange: Mock delayed response to keep loading state visible
            const mockComponentsData = {
                frontends: [],
                backends: [],
                integrations: [],
                appBuilder: [],
                dependencies: [],
                envVars: {},
            };

            // Create a promise that won't resolve immediately
            let resolveRequest: (value: any) => void;
            const requestPromise = new Promise((resolve) => {
                resolveRequest = resolve;
            });

            (mockVscode.request as jest.Mock).mockReturnValue(requestPromise);

            // Act: Render component with Provider wrapper
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={mockState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Assert: Verify loading state is shown
            expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

            // Resolve the request
            resolveRequest!(mockComponentsData);

            // Verify loading state is removed
            await waitFor(() => {
                expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
            });
        });

        it('should handle error state and empty component list', async () => {
            // Arrange: Mock failed request
            const error = new Error('Failed to fetch components');
            mockFailedRequest(mockVscode, error);

            // Act: Render component with Provider wrapper
            render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={mockState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Assert: Verify error message is displayed
            await waitFor(() => {
                expect(screen.getByText(/failed to load components/i)).toBeInTheDocument();
            });

            // Test empty list case
            jest.clearAllMocks();
            const emptyData = {
                frontends: [],
                backends: [],
                integrations: [],
                appBuilder: [],
                dependencies: [],
                envVars: {},
            };
            mockSuccessfulRequest(mockVscode, emptyData);

            // Re-render with empty data and Provider wrapper
            const { rerender } = render(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={mockState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            rerender(
                <Provider theme={defaultTheme}>
                    <ComponentSelectionStep
                        state={mockState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Verify empty state handling (pickers should still be rendered but empty)
            await waitFor(() => {
                expect(screen.getByLabelText('Select frontend system')).toBeInTheDocument();
                expect(screen.getByLabelText('Select backend system')).toBeInTheDocument();
            });
        });
    });
});
