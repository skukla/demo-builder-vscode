import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
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
            expect(screen.getByText('Select Organization')).toBeInTheDocument();
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

        it('should trigger org selection when Select Organization is clicked', async () => {
            const user = userEvent.setup();
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

            const selectOrgButton = screen.getByText('Select Organization');
            await user.click(selectOrgButton);

            expect(mockRequestAuth).toHaveBeenCalledWith(true); // force = true
        });

        it('should clear dependent state when org changes after re-auth', async () => {
            // Setup: User is authenticated with org1, has project/workspace selected
            const messageCallback = setupAuthStatusMock();
            const user = userEvent.setup();
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

            // Action: Click Switch Organizations
            const switchButton = screen.getByText('Switch Organizations');
            await user.click(switchButton);

            // Verify: requestAuth is called with force=true
            expect(mockRequestAuth).toHaveBeenCalledWith(true);

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
            const user = userEvent.setup();
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

            // Action: Click Switch Organizations (but will re-auth with same org)
            const switchButton = screen.getByText('Switch Organizations');
            await user.click(switchButton);

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
