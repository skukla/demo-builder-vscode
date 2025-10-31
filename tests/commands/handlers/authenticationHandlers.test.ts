/**
 * Authentication Handlers Tests
 *
 * Tests for Adobe authentication operations:
 * - handleCheckAuth: Quick authentication status check
 * - handleAuthenticate: Browser-based Adobe login flow
 */

import {
    handleCheckAuth,
    handleAuthenticate
} from '@/features/authentication/handlers/authenticationHandlers';
import { HandlerContext } from '../../../src/commands/handlers/HandlerContext';

describe('authenticationHandlers', () => {
    let mockContext: jest.Mocked<HandlerContext>;
    let mockAuthManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock authentication manager
        mockAuthManager = {
            isAuthenticatedQuick: jest.fn(),
            getCurrentOrganization: jest.fn(),
            getCurrentProject: jest.fn(),
            wasOrgClearedDueToValidation: jest.fn(),
            ensureSDKInitialized: jest.fn(),
            login: jest.fn(),
            clearCache: jest.fn(),
            getOrganizations: jest.fn(),
            autoSelectOrganizationIfNeeded: jest.fn(),
            setOrgRejectedFlag: jest.fn(),
            validateAndClearInvalidOrgContext: jest.fn()
        };

        // Create mock context
        mockContext = {
            authManager: mockAuthManager,
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn()
            } as any,
            debugLogger: {
                debug: jest.fn()
            } as any,
            sendMessage: jest.fn().mockResolvedValue(undefined),
            sharedState: {
                isAuthenticating: false
            }
        } as any;
    });

    describe('handleCheckAuth', () => {
        describe('Success Cases', () => {
            it('should check authentication status successfully', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue({
                    id: 'proj-123',
                    name: 'Test Project'
                });

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockAuthManager.isAuthenticatedQuick).toHaveBeenCalled();
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false
                }));
            });

            it('should return not authenticated status', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    message: 'Sign in required'
                }));
            });

            it('should show checking status before completion', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue(null);

                await handleCheckAuth(mockContext);

                // First call should show checking status
                expect(mockContext.sendMessage).toHaveBeenNthCalledWith(1, 'auth-status', {
                    isChecking: true,
                    message: 'Connecting to Adobe services...',
                    subMessage: 'Verifying your credentials'
                });
            });

            it('should handle authenticated with organization but no project', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue(null);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    authenticated: true,
                    message: 'Ready to continue',
                    subMessage: 'Connected to Test Org'
                }));
            });

            it('should handle authenticated with org and project', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue({
                    id: 'proj-123',
                    name: 'Test Project'
                });

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    authenticated: true,
                    subMessage: 'Connected to Test Org - Test Project'
                }));
            });

            it('should initialize SDK when authenticated', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });

                await handleCheckAuth(mockContext);

                expect(mockAuthManager.ensureSDKInitialized).toHaveBeenCalled();
            });
        });

        describe('Organization Access Cases', () => {
            it('should handle authenticated but no organization selected', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue(null);
                mockAuthManager.wasOrgClearedDueToValidation.mockReturnValue(false);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    authenticated: true,
                    message: 'Action required',
                    subMessage: 'Your previous organization is no longer accessible',
                    requiresOrgSelection: true
                }));
            });

            it('should handle organization cleared due to validation failure', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue(null);
                mockAuthManager.wasOrgClearedDueToValidation.mockReturnValue(true);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    message: 'Action required',
                    subMessage: 'Organization no longer accessible or lacks App Builder access',
                    requiresOrgSelection: true,
                    orgLacksAccess: true
                }));
            });
        });

        describe('Error Cases', () => {
            it('should handle authentication check failure', async () => {
                const error = new Error('Network error');
                mockAuthManager.isAuthenticatedQuick.mockRejectedValue(error);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(false);
                expect(mockContext.logger.error).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Failed to check auth'),
                    error
                );
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    authenticated: false,
                    error: true,
                    message: 'Connection issue'
                }));
            });

            it('should handle organization fetch error', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockRejectedValue(new Error('Org fetch failed'));

                const result = await handleCheckAuth(mockContext);

                // Should still return success but with error message
                expect(result.success).toBe(false);
                expect(mockContext.logger.error).toHaveBeenCalled();
            });
        });

        describe('Performance Logging', () => {
            it('should log performance metrics', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });

                await handleCheckAuth(mockContext);

                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Quick authentication check completed')
                );
            });
        });
    });

    describe('handleAuthenticate', () => {
        describe('Success Cases', () => {
            it('should authenticate user successfully', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue(null);
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                expect(mockAuthManager.login).toHaveBeenCalledWith(false);
                expect(mockContext.sharedState.isAuthenticating).toBe(false);
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    authenticated: true,
                    isAuthenticated: true
                }));
            });

            it('should skip login if already authenticated', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue(null);

                const result = await handleAuthenticate(mockContext, { force: false });

                expect(result.success).toBe(true);
                expect(mockAuthManager.login).not.toHaveBeenCalled();
                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Already authenticated')
                );
            });

            it('should force login even if authenticated', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue(null);
                mockAuthManager.getCurrentProject.mockResolvedValue(null);
                mockAuthManager.getOrganizations.mockResolvedValue([]);
                mockAuthManager.wasOrgClearedDueToValidation.mockReturnValue(false);
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                const result = await handleAuthenticate(mockContext, { force: true });

                expect(result.success).toBe(true);
                expect(mockAuthManager.login).toHaveBeenCalledWith(true);
                expect(mockAuthManager.clearCache).toHaveBeenCalled();
            });

            it('should set isAuthenticating flag during operation', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockImplementation(async () => {
                    expect(mockContext.sharedState.isAuthenticating).toBe(true);
                    return true;
                });
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                await handleAuthenticate(mockContext);

                expect(mockContext.sharedState.isAuthenticating).toBe(false);
            });

            it('should show opening browser message', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    isChecking: true,
                    message: 'Opening browser for authentication...'
                }));
            });
        });

        describe('Organization Selection Cases', () => {
            it('should auto-select single available organization', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValueOnce(null);
                mockAuthManager.getOrganizations.mockResolvedValue([
                    { id: 'org-123', name: 'Only Org' }
                ]);
                mockAuthManager.autoSelectOrganizationIfNeeded.mockResolvedValue({
                    id: 'org-123',
                    name: 'Only Org'
                });
                mockAuthManager.getCurrentOrganization.mockResolvedValueOnce({
                    id: 'org-123',
                    name: 'Only Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue(null);
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                expect(mockAuthManager.autoSelectOrganizationIfNeeded).toHaveBeenCalledWith(true);
                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Auto-selecting single available organization')
                );
            });

            it('should handle multiple organizations with forced login', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue(null);
                mockAuthManager.getOrganizations.mockResolvedValue([
                    { id: 'org-1', name: 'Org 1' },
                    { id: 'org-2', name: 'Org 2' }
                ]);
                mockAuthManager.wasOrgClearedDueToValidation.mockReturnValue(false);
                mockAuthManager.getCurrentProject.mockResolvedValue(null);
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                const result = await handleAuthenticate(mockContext, { force: true });

                expect(result.success).toBe(true);
                expect(mockAuthManager.setOrgRejectedFlag).toHaveBeenCalled();
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    requiresOrgSelection: true
                }));
            });

            it('should validate organization has App Builder access', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue(null);
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                await handleAuthenticate(mockContext);

                expect(mockAuthManager.validateAndClearInvalidOrgContext).toHaveBeenCalledWith(true);
            });

            it('should handle organization cleared after validation', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(true);

                // First call returns org, second call (after validation) returns null
                mockAuthManager.getCurrentOrganization
                    .mockResolvedValueOnce({ id: 'org-123', name: 'Test Org' })
                    .mockResolvedValueOnce(null)
                    .mockResolvedValueOnce(null);

                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);
                mockAuthManager.getCurrentProject.mockResolvedValue(null);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Organization "Test Org" was cleared - lacks App Builder access')
                );
            });
        });

        describe('Error Cases', () => {
            it('should handle login timeout', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(false);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(false);
                expect(mockContext.sharedState.isAuthenticating).toBe(false);
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    authenticated: false,
                    error: 'timeout',
                    message: 'Authentication timed out'
                }));
            });

            it('should handle login failure', async () => {
                const error = new Error('Login failed');
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockRejectedValue(error);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(false);
                expect(mockContext.sharedState.isAuthenticating).toBe(false);
                expect(mockContext.logger.error).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Failed to start authentication'),
                    error
                );
                expect(mockContext.sendMessage).toHaveBeenCalledWith('authError', {
                    error: 'Login failed'
                });
            });

            it('should prevent duplicate authentication requests', async () => {
                mockContext.sharedState.isAuthenticating = true;

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(false);
                expect(mockAuthManager.login).not.toHaveBeenCalled();
                expect(mockContext.logger.warn).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Authentication already in progress')
                );
            });

            it('should reset isAuthenticating flag on error', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockRejectedValue(new Error('Network error'));

                await handleAuthenticate(mockContext);

                expect(mockContext.sharedState.isAuthenticating).toBe(false);
            });
        });

        describe('Cache Management', () => {
            it('should clear cache after forced login', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue(null);
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                await handleAuthenticate(mockContext, { force: true });

                expect(mockAuthManager.clearCache).toHaveBeenCalled();
            });

            it('should not clear cache for normal login', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                await handleAuthenticate(mockContext, { force: false });

                expect(mockAuthManager.clearCache).not.toHaveBeenCalled();
            });
        });

        describe('SDK Initialization', () => {
            it('should initialize SDK when already authenticated', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });

                await handleAuthenticate(mockContext, { force: false });

                expect(mockAuthManager.ensureSDKInitialized).toHaveBeenCalled();
            });
        });

        describe('Performance Logging', () => {
            it('should log authentication duration', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                await handleAuthenticate(mockContext);

                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Authentication completed successfully after')
                );
            });

            it('should log post-login setup time', async () => {
                mockAuthManager.isAuthenticatedQuick.mockResolvedValue(false);
                mockAuthManager.login.mockResolvedValue(true);
                mockAuthManager.getCurrentOrganization.mockResolvedValue({
                    id: 'org-123',
                    name: 'Test Org'
                });
                mockAuthManager.getCurrentProject.mockResolvedValue(null);
                mockAuthManager.validateAndClearInvalidOrgContext.mockResolvedValue(undefined);

                await handleAuthenticate(mockContext);

                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('[Auth] Post-login setup completed in')
                );
            });
        });
    });
});
