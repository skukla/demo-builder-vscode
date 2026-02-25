/**
 * Adobe Auth Guard Tests
 *
 * Tests for ensureAdobeIOAuth shared utility:
 * - Already authenticated (fast path)
 * - Expired token with sign-in prompt
 * - User cancellation
 * - Custom options (logPrefix, warningMessage, projectContext)
 * - Logger behavior
 */

import * as vscode from 'vscode';
import {
    ensureAdobeIOAuth,
    type AdobeAuthManager,
    type AdobeAuthResult,
} from '@/core/auth/adobeAuthGuard';
import type { Logger } from '@/types/logger';

// =============================================================================
// Test Utilities
// =============================================================================

function createMockAuthManager(overrides: Partial<AdobeAuthManager> = {}): AdobeAuthManager {
    return {
        isAuthenticated: jest.fn().mockResolvedValue(false),
        loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        ...overrides,
    };
}

function createMockLogger(): Logger {
    return {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;
}

// =============================================================================
// Tests
// =============================================================================

describe('ensureAdobeIOAuth', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger();
    });

    // =========================================================================
    // Already Authenticated (Fast Path)
    // =========================================================================

    it('should return authenticated true when already authenticated', async () => {
        // Given: User is already authenticated
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn().mockResolvedValue(true),
        });

        // When: ensureAdobeIOAuth is called
        const result: AdobeAuthResult = await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: Should return authenticated without showing UI
        expect(result).toEqual({ authenticated: true });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Expired Token - Sign In Flow
    // =========================================================================

    it('should return authenticated true when sign-in succeeds and post-check passes', async () => {
        // Given: Token expired, user clicks Sign In, login succeeds, post-check passes
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn()
                .mockResolvedValueOnce(false)  // Initial check: expired
                .mockResolvedValueOnce(true),  // Post-login check: valid
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Sign In');

        // When: ensureAdobeIOAuth is called
        const result = await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: Should return authenticated
        expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated false when login returns false', async () => {
        // Given: Token expired, user clicks Sign In, but login fails
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn().mockResolvedValue(false),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(false),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Sign In');

        // When: ensureAdobeIOAuth is called
        const result = await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: Should return not authenticated
        expect(result).toEqual({ authenticated: false });
    });

    it('should return authenticated false when login succeeds but post-check fails', async () => {
        // Given: Token expired, login returns true, but post-check still fails
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn()
                .mockResolvedValueOnce(false)  // Initial check
                .mockResolvedValueOnce(false), // Post-login check fails
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Sign In');

        // When: ensureAdobeIOAuth is called
        const result = await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: Should return not authenticated
        expect(result).toEqual({ authenticated: false });
    });

    // =========================================================================
    // User Cancellation
    // =========================================================================

    it('should return cancelled when user clicks Cancel', async () => {
        // Given: Token expired, user clicks Cancel
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn().mockResolvedValue(false),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

        // When: ensureAdobeIOAuth is called
        const result = await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: Should return cancelled
        expect(result).toEqual({ authenticated: false, cancelled: true });
    });

    it('should return cancelled when user dismisses the dialog (undefined)', async () => {
        // Given: Token expired, user dismisses dialog
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn().mockResolvedValue(false),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

        // When: ensureAdobeIOAuth is called
        const result = await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: Should return cancelled
        expect(result).toEqual({ authenticated: false, cancelled: true });
    });

    // =========================================================================
    // Custom Options
    // =========================================================================

    it('should pass custom warningMessage to showWarningMessage', async () => {
        // Given: Token expired with custom warning
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn().mockResolvedValue(false),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

        // When: ensureAdobeIOAuth is called with custom warningMessage
        await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
            warningMessage: 'Custom sign-in message for mesh.',
        });

        // Then: showWarningMessage should receive the custom message
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Custom sign-in message for mesh.',
            'Sign In',
            'Cancel',
        );
    });

    it('should use custom logPrefix in log messages', async () => {
        // Given: Token expired with custom prefix
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn().mockResolvedValue(false),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

        // When: ensureAdobeIOAuth is called with custom logPrefix
        await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
            logPrefix: '[Mesh Deployment]',
        });

        // Then: Log messages should contain the custom prefix
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[Mesh Deployment]'),
        );
    });

    it('should forward projectContext to loginAndRestoreProjectContext', async () => {
        // Given: Token expired with project context
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Sign In');
        const projectContext = {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        };

        // When: ensureAdobeIOAuth is called with projectContext
        await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
            projectContext,
        });

        // Then: loginAndRestoreProjectContext should receive the context
        expect(authManager.loginAndRestoreProjectContext).toHaveBeenCalledWith(projectContext);
    });

    // =========================================================================
    // Default Values
    // =========================================================================

    it('should use default values for optional parameters', async () => {
        // Given: Token expired, no optional params
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Sign In');

        // When: ensureAdobeIOAuth is called with only required params
        await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: Should use default warningMessage
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Adobe sign-in required to continue.',
            'Sign In',
            'Cancel',
        );
        // And default empty projectContext
        expect(authManager.loginAndRestoreProjectContext).toHaveBeenCalledWith({});
        // And default logPrefix [Auth] in the warn call
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[Auth]'),
        );
    });

    // =========================================================================
    // Logger Behavior
    // =========================================================================

    it('should call logger.warn when token is expired', async () => {
        // Given: Token expired
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn().mockResolvedValue(false),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

        // When: ensureAdobeIOAuth is called
        await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: logger.warn should be called
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('token expired or missing'),
        );
    });

    it('should call logger.info on successful sign-in', async () => {
        // Given: Token expired, sign-in succeeds
        const authManager = createMockAuthManager({
            isAuthenticated: jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Sign In');

        // When: ensureAdobeIOAuth is called
        await ensureAdobeIOAuth({
            authManager,
            logger: mockLogger,
        });

        // Then: logger.info should be called for sign-in start and success
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Starting Adobe sign-in'),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('sign-in successful'),
        );
    });
});
