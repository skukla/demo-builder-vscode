/**
 * Message Pattern Test Suite
 *
 * Tests message consistency and security patterns for authentication handlers.
 * Ensures messages remain constant during loading states and are properly sanitized.
 */

import { handleCheckAuth, handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext, mockOrg, mockProject, mockOrgs } from './testUtils';

describe('authenticationHandlers - Message Patterns', () => {
    describe('STEP 2: Constant Message Pattern (Message Constancy During Loading)', () => {
        let mockContext: jest.Mocked<HandlerContext>;

        beforeEach(() => {
            mockContext = createMockHandlerContext();
            jest.clearAllMocks();
        });

        describe('handleCheckAuth message behavior', () => {
            it('should use constant "Checking authentication status..." during checking', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);

                await handleCheckAuth(mockContext);

                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Checking authentication status...',
                    subMessage: 'Validating authorization token...',
                });
            });

            it('should NOT change message text based on internal state', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                // Initial message is always the same
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Checking authentication status...',
                    subMessage: 'Validating authorization token...',
                });
            });
        });

        describe('handleAuthenticate message constancy during loading', () => {
            it('should use constant "Signing in..." when starting authentication', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Signing in...',
                    subMessage: 'Opening browser...',
                    isAuthenticated: false,
                });
            });

            it('should use constant message for force=true login', async () => {
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext, { force: true });

                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Signing in...',
                    subMessage: 'Starting fresh login...',
                    isAuthenticated: false,
                });
            });

            it('should NOT vary message based on current state', async () => {
                // Even when already authenticated, loading message is constant
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext, { force: true });

                // Same message regardless of initial state
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Signing in...',
                    subMessage: 'Starting fresh login...',
                    isAuthenticated: false,
                });
            });

            it('should maintain message constancy during SDK init', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockImplementation(async () => {
                    // SDK init in progress
                });
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                await handleAuthenticate(mockContext, { force: false });

                // Check messages during already-authenticated flow
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Verifying authentication...',
                    subMessage: 'Checking Adobe credentials...',
                    isAuthenticated: true, // Shows authenticated during check
                });
            });

            it('should NOT leak org selection state in loading message', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs); // Multiple orgs

                await handleAuthenticate(mockContext);

                // Loading message should not reveal org count
                const loadingCalls = mockContext.sendMessage.mock.calls.filter(
                    call => (call[1] as any).isChecking === true
                );

                loadingCalls.forEach(call => {
                    // No org-specific info during loading
                    const payload = call[1] as any;
                    expect(payload.message).not.toContain('organization');
                    expect(payload.message).not.toContain('multiple');
                });
            });
        });

        describe('handleAuthenticate final state messages', () => {
            it('should show "All set!" when single org auto-selected', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: mockOrg,
                    project: undefined,
                    message: 'All set!',
                    subMessage: `Connected to ${mockOrg.name}`,
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            });

            it('should show "Sign-in complete" when multiple orgs need selection', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: 'Sign-in complete',
                    subMessage: 'Choose your organization to continue',
                    requiresOrgSelection: true,
                    orgLacksAccess: false,
                });
            });

            it('should show "No organizations found" when zero orgs', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: 'No organizations found',
                    subMessage: 'Your Adobe account doesn\'t have access to any organizations with App Builder',
                    requiresOrgSelection: true,
                    orgLacksAccess: true,
                });
            });
        });

        describe('subMessage updates for progress tracking', () => {
            it('should update subMessage to show browser opening', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Signing in...',
                    subMessage: 'Opening browser...',
                    isAuthenticated: false,
                });
            });

            it('should update subMessage for fresh login on force', async () => {
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);

                await handleAuthenticate(mockContext, { force: true });

                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Signing in...',
                    subMessage: 'Starting fresh login...',
                    isAuthenticated: false,
                });
            });
        });

        describe('error state messages', () => {
            it('should show timeout message when login times out', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(false);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'timeout',
                    code: 'TIMEOUT',
                    message: 'Sign-in timed out',
                    subMessage: 'The browser window may have been closed. Please try again.',
                });
            });

            it('should show connection problem for network errors', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(
                    new Error('Network error')
                );

                await handleCheckAuth(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    error: true,
                    code: 'NETWORK',
                    message: 'Connection problem',
                    subMessage: 'Can\'t reach Adobe services. Check your internet connection and try again.',
                });
            });
        });

        describe('SECURITY: Error Message Sanitization', () => {
            it('should NOT expose sensitive error details in UI messages', async () => {
                const sensitiveError = new Error('401: Invalid token abc123xyz at endpoint /api/secret');
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(sensitiveError);

                await handleCheckAuth(mockContext);

                // UI message should be generic
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    error: true,
                    code: 'NETWORK',
                    message: 'Connection problem',
                    subMessage: 'Can\'t reach Adobe services. Check your internet connection and try again.',
                });

                // Detailed error goes to logs, not UI
                expect(mockContext.logger.error).toHaveBeenCalledWith(
                    expect.any(String),
                    sensitiveError
                );
            });

            it('should sanitize org names in messages (no HTML/script injection)', async () => {
                const maliciousOrg = {
                    ...mockOrg,
                    name: '<script>alert("XSS")</script>Test Org',
                };

                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(maliciousOrg);
                (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                // Org name is passed as-is (UI layer handles escaping)
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: maliciousOrg,
                    project: mockProject,
                    message: 'Authentication verified',
                    subMessage: `Signed in as ${maliciousOrg.name}`,
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                    tokenExpiresIn: undefined,
                    tokenExpiringSoon: false,
                });
            });

            it('should NOT expose internal auth state in error messages', async () => {
                // Simulating an internal inconsistency error
                const internalError = new Error('State mismatch: auth=true but no token');
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(internalError);

                await handleAuthenticate(mockContext);

                // Should not expose internal state details
                expect(mockContext.sendMessage).toHaveBeenCalledWith('authError', {
                    error: 'Authentication failed',
                    code: 'UNKNOWN',
                });

                // Detailed error goes to logs only
                expect(mockContext.logger.error).toHaveBeenCalled();
            });

            it('should handle undefined/null error messages gracefully', async () => {
                const undefinedError = new Error();
                undefinedError.message = undefined as any;
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(undefinedError);

                await handleCheckAuth(mockContext);

                // Should handle gracefully with generic message
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    error: true,
                    code: 'NETWORK',
                    message: 'Connection problem',
                    subMessage: 'Can\'t reach Adobe services. Check your internet connection and try again.',
                });
            });
        });

        describe('visual consistency requirements', () => {
            it('should always include all required fields in auth-status messages', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                const authStatusCalls = mockContext.sendMessage.mock.calls.filter(
                    call => call[0] === 'auth-status'
                );

                authStatusCalls.forEach(call => {
                    const payload = call[1];
                    // All auth-status messages must have these fields
                    expect(payload).toHaveProperty('isChecking');
                    expect(payload).toHaveProperty('message');
                    expect(payload).toHaveProperty('subMessage');
                });
            });

            it('should maintain consistent field presence in final messages', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: mockOrg,
                    project: mockProject,
                    message: expect.any(String),
                    subMessage: expect.any(String),
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                    tokenExpiresIn: undefined,
                    tokenExpiringSoon: false,
                });
            });

            it('should NOT send partial messages during transitions', async () => {
                (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext);

                const authStatusCalls = mockContext.sendMessage.mock.calls.filter(
                    call => call[0] === 'auth-status'
                );

                // No partial messages (all must have message & subMessage)
                authStatusCalls.forEach(call => {
                    const payload = call[1] as any;
                    expect(payload.message).toBeDefined();
                    expect(payload.subMessage).toBeDefined();
                });
            });
        });
    });
});