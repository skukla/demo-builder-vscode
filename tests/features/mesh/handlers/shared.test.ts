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
import { ServiceLocator } from '@/core/di';
import { ErrorCode } from '@/types/errorCodes';

// Mock dependencies
jest.mock('vscode', () => ({
    window: {
        showWarningMessage: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
}));

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

describe('ensureAuthenticated', () => {
    const mockAuthManager = {
        isAuthenticated: jest.fn(),
    };

    const mockLogger = {
        warn: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthManager);
    });

    describe('when user is authenticated', () => {
        beforeEach(() => {
            mockAuthManager.isAuthenticated.mockResolvedValue(true);
        });

        it('should return authenticated: true', async () => {
            const result = await ensureAuthenticated(mockLogger as any);

            expect(result.authenticated).toBe(true);
        });

        it('should not show warning message', async () => {
            await ensureAuthenticated(mockLogger as any);

            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('should not have error property', async () => {
            const result = await ensureAuthenticated(mockLogger as any);

            expect(result.error).toBeUndefined();
            expect(result.code).toBeUndefined();
        });
    });

    describe('when user is NOT authenticated', () => {
        beforeEach(() => {
            mockAuthManager.isAuthenticated.mockResolvedValue(false);
        });

        it('should return authenticated: false', async () => {
            const result = await ensureAuthenticated(mockLogger as any);

            expect(result.authenticated).toBe(false);
        });

        it('should log warning about authentication required', async () => {
            await ensureAuthenticated(mockLogger as any);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Authentication required')
            );
        });

        it('should show warning message with Open Dashboard button', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

            await ensureAuthenticated(mockLogger as any);

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('Adobe authentication required'),
                'Open Dashboard'
            );
        });

        it('should return error message and AUTH_REQUIRED code', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

            const result = await ensureAuthenticated(mockLogger as any);

            expect(result.error).toContain('authentication required');
            expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        });

        describe('when user clicks "Open Dashboard"', () => {
            beforeEach(() => {
                (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Open Dashboard');
            });

            it('should execute showProjectDashboard command', async () => {
                await ensureAuthenticated(mockLogger as any);

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
                await ensureAuthenticated(mockLogger as any);

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
            await ensureAuthenticated(mockLogger as any, 'create mesh');

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('create mesh'),
                'Open Dashboard'
            );
        });

        it('should use default operation name if not provided', async () => {
            await ensureAuthenticated(mockLogger as any);

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('API Mesh'),
                'Open Dashboard'
            );
        });
    });

    describe('return type conformance', () => {
        it('should return AuthGuardResult type', async () => {
            mockAuthManager.isAuthenticated.mockResolvedValue(true);

            const result: AuthGuardResult = await ensureAuthenticated(mockLogger as any);

            // Type check passes if this compiles
            expect(result).toHaveProperty('authenticated');
        });
    });
});
