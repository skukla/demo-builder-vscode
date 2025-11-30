import { render, screen } from '@testing-library/react';
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

        it('should clear dependent state when switching organizations', async () => {
            const user = userEvent.setup();
            const mockUpdate = jest.fn();
            const state = {
                ...baseState,
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
            };

            render(
                <AdobeAuthStep
                    state={state as WizardState}
                    updateState={mockUpdate}
                    setCanProceed={mockSetCanProceed}
                />
            );

            const switchButton = screen.getByText('Switch Organizations');
            await user.click(switchButton);

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeOrg: undefined,
                    adobeProject: undefined,
                    adobeWorkspace: undefined,
                })
            );
        });
    });
});
