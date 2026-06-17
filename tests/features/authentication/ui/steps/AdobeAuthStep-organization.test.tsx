import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockRequestAuth,
    baseState,
    resetMocks,
    cleanupTests,
    setupAuthStatusMock,
} from './AdobeAuthStep.testUtils';

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => {
    const {
        mockPostMessage,
        mockRequestAuth,
        mockOnMessage,
    } = require('./AdobeAuthStep.testUtils');

    return {
        webviewClient: {
            postMessage: (...args: any[]) => mockPostMessage(...args),
            requestAuth: (...args: any[]) => mockRequestAuth(...args),
            onMessage: (...args: any[]) => mockOnMessage(...args),
        },
    };
});

// Mock LoadingDisplay component
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => {
    const React = require('react');
    return {
        LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) => (
            <div data-testid="loading-display">
                <div>{message}</div>
                {subMessage && <div>{subMessage}</div>}
            </div>
        ),
    };
});

describe('AdobeAuthStep - Organization Selection', () => {
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    describe('Organization Selection', () => {
        it('should display org selection prompt when authenticated without org', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                    requiresOrgSelection: false,
                },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={jest.fn()}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText('Select Your Organization')).toBeInTheDocument();
            expect(screen.getByText('Switch IMS Org')).toBeInTheDocument();
        });

        it('should display specific message when org lacks access', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                    orgLacksAccess: true,
                },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={jest.fn()}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText(/No organizations are currently accessible/)).toBeInTheDocument();
        });

        it('should display message when previous org no longer accessible', () => {
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                    requiresOrgSelection: true,
                },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={jest.fn()}
                    setCanProceed={mockSetCanProceed}
                />
            );

            expect(screen.getByText(/Your previous organization is no longer accessible/)).toBeInTheDocument();
        });

        it('forces a re-login (account switch) when Switch IMS Org is clicked without an org', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const state = {
                ...baseState,
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                },
                adobeOrg: undefined,
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={jest.fn()}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const switchButton = screen.getByText('Switch IMS Org');
            await user.click(switchButton);

            // No in-app picker: reaching another org requires a forced re-login.
            expect(mockRequestAuth).toHaveBeenCalledWith(true);
        });

        it('forces a re-login (account switch) when Switch IMS Org is clicked with an org', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={jest.fn()}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const switchButton = screen.getByText('Switch IMS Org');
            await user.click(switchButton);

            expect(mockRequestAuth).toHaveBeenCalledWith(true);
        });

        it('should clear dependent state when org changes after re-auth (message-driven cascade)', async () => {
            // The org-change cascade is driven by the auth message, independent of
            // which control initiated it (force-login still exists for account switch).
            const messageCallback = setupAuthStatusMock();
            const mockUpdate = jest.fn();
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
                adobeProject: { id: 'proj1', name: 'Test Project' },
                adobeWorkspace: { id: 'ws1', name: 'Test Workspace' },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdate}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Simulate: Auth completes with a DIFFERENT org
            messageCallback({
                isAuthenticated: true,
                isChecking: false,
                organization: { id: 'org2', code: 'ORG2', name: 'Different Organization' },
            });

            // Result: Dependent state should be cleared because org changed
            await waitFor(() => {
                expect(mockUpdate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        adobeProject: undefined,
                        adobeWorkspace: undefined,
                    })
                );
            });
        });

        it('should preserve dependent state when re-authenticating with same org', async () => {
            // Setup: User is authenticated with org1, has project/workspace selected
            const messageCallback = setupAuthStatusMock();
            const mockUpdate = jest.fn();
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
                adobeProject: { id: 'proj1', name: 'Test Project' },
                adobeWorkspace: { id: 'ws1', name: 'Test Workspace' },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdate}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Simulate: Auth completes with SAME org
            messageCallback({
                isAuthenticated: true,
                isChecking: false,
                organization: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
            });

            // Result: Dependent state should NOT be cleared (no adobeProject/adobeWorkspace in update)
            await waitFor(() => {
                // Get the last call to mockUpdate that has auth info
                const authUpdateCalls = mockUpdate.mock.calls.filter(
                    (call) => call[0].adobeAuth !== undefined
                );
                const lastAuthUpdate = authUpdateCalls[authUpdateCalls.length - 1]?.[0];

                // Should NOT have adobeProject: undefined in the update
                expect(lastAuthUpdate?.adobeProject).toBeUndefined();
                expect(lastAuthUpdate?.adobeWorkspace).toBeUndefined();
            });
        });
    });
});
