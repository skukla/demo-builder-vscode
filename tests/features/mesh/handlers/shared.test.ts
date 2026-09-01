/**
 * Mesh Handlers - Shared Utilities Tests
 *
 * TDD: Tests written FIRST to define ensureAuthenticated behavior before implementation.
 *
 * The ensureAuthenticated helper consolidates the auth guard pattern duplicated in:
 * - createHandler.ts
 * - checkHandler.ts
 * - deleteHandler.ts
 */

import * as vscode from 'vscode';
import { ensureAuthenticated, type AuthGuardResult } from '@/features/mesh/handlers/shared';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { ErrorCode } from '@/types/errorCodes';
import { createMockLogger } from '../../../helpers/loggerFake';

// Mock dependencies
jest.mock('vscode', () => ({
    window: {
        showWarningMessage: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
}));

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

describe('ensureAuthenticated', () => {
    const mockAuthManager = {
        isAuthenticated: jest.fn(),
    };

    const mockLogger = createMockLogger();

    /**
     * The WEBVIEW surface: a panel is present, so a person is looking at this and
     * the notification is the right answer. Every case below was written before
     * the guard branched on the surface, so this is what they were always testing.
     */
    const panelContext = { logger: mockLogger, panel: {} } as unknown as Parameters<
        typeof ensureAuthenticated
    >[0];

    /** The AGENT surface: no panel, so the guard must report and never prompt. */
    const headlessContext = { logger: mockLogger, panel: undefined } as unknown as Parameters<
        typeof ensureAuthenticated
    >[0];

    beforeEach(() => {
        jest.clearAllMocks();
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);
    });

    describe('when user is authenticated', () => {
        beforeEach(() => {
            mockAuthManager.isAuthenticated.mockResolvedValue(true);
        });

        it('should return authenticated: true', async () => {
            const result = await ensureAuthenticated(panelContext);

            expect(result.authenticated).toBe(true);
        });

        it('should not show warning message', async () => {
            await ensureAuthenticated(panelContext);

            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('should not have error property', async () => {
            const result = await ensureAuthenticated(panelContext);

            expect(result.error).toBeUndefined();
            expect(result.code).toBeUndefined();
        });
    });

    describe('when user is NOT authenticated', () => {
        beforeEach(() => {
            mockAuthManager.isAuthenticated.mockResolvedValue(false);
        });

        it('should return authenticated: false', async () => {
            const result = await ensureAuthenticated(panelContext);

            expect(result.authenticated).toBe(false);
        });

        it('should log warning about authentication required', async () => {
            await ensureAuthenticated(panelContext);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Authentication required')
            );
        });

        it('should show warning message with Open Dashboard button', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

            await ensureAuthenticated(panelContext);

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('Adobe authentication required'),
                'Open Dashboard'
            );
        });

        it('should return error message and AUTH_REQUIRED code', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

            const result = await ensureAuthenticated(panelContext);

            expect(result.error).toContain('authentication required');
            expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        });

        describe('when user clicks "Open Dashboard"', () => {
            beforeEach(() => {
                (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Open Dashboard');
            });

            it('should execute showProjectDashboard command', async () => {
                await ensureAuthenticated(panelContext);

                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'demoBuilder.showProjectDashboard'
                );
            });
        });

        describe('when user dismisses the dialog', () => {
            beforeEach(() => {
                (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
            });

            it('should NOT execute any command', async () => {
                await ensureAuthenticated(panelContext);

                expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
            });
        });
    });

    describe('custom operation name', () => {
        beforeEach(() => {
            mockAuthManager.isAuthenticated.mockResolvedValue(false);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        });

        it('should include operation name in warning message', async () => {
            await ensureAuthenticated(panelContext, 'create mesh');

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('create mesh'),
                'Open Dashboard'
            );
        });

        it('should use default operation name if not provided', async () => {
            await ensureAuthenticated(panelContext);

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('API Mesh'),
                'Open Dashboard'
            );
        });
    });

    describe('return type conformance', () => {
        it('should return AuthGuardResult type', async () => {
            mockAuthManager.isAuthenticated.mockResolvedValue(true);

            const result: AuthGuardResult = await ensureAuthenticated(panelContext);

            // Type check passes if this compiles
            expect(result).toHaveProperty('authenticated');
        });
    });

    describe('the AGENT surface never prompts', () => {
        /**
         * The defect this pins, found 2026-08-31 by reviewing all 114 MCP tools:
         * this guard ALWAYS awaited `showWarningMessage(..., 'Open Dashboard')`.
         * An unauthenticated call from `check_mesh` or `delete_mesh` therefore put
         * a notification on the user's window and blocked the tool until somebody
         * dismissed it — and an agent cannot click.
         *
         * `dataInstallerHandlers` had already met this and written the rule down:
         * "correct from a webview, wrong from an agent tool". The mesh handlers
         * never got that treatment.
         */
        beforeEach(() => {
            mockAuthManager.isAuthenticated.mockResolvedValue(false);
        });

        it('does NOT show a notification when there is no panel', async () => {
            await ensureAuthenticated(headlessContext, 'check mesh status');
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('returns the needsAuth marker so the agent can offer the sign-in', async () => {
            const result = await ensureAuthenticated(headlessContext, 'check mesh status');
            expect(result.authenticated).toBe(false);
            expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
            expect(result.needsAuth).toBe('adobe');
            expect(result.error).toContain('sign_in');
        });

        it('CONTROL: the webview surface still prompts', async () => {
            await ensureAuthenticated(panelContext, 'check mesh status');
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });

        it('CONTROL: an authenticated caller is untouched on either surface', async () => {
            mockAuthManager.isAuthenticated.mockResolvedValue(true);
            const headless = await ensureAuthenticated(headlessContext);
            const panel = await ensureAuthenticated(panelContext);
            expect(headless).toEqual({ authenticated: true });
            expect(panel).toEqual({ authenticated: true });
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });
    });
});
