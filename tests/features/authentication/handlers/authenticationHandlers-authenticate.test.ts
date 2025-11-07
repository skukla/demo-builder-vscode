/**
 * handleAuthenticate Test Suite
 *
 * Tests the browser-based Adobe login flow handler.
 * This handler performs full authentication with organization/project selection.
 */

import { handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext, mockOrg, mockProject, mockOrgs } from './testUtils';

describe('authenticationHandlers - handleAuthenticate', () => {
        let mockContext: jest.Mocked<HandlerContext>;

        beforeEach(() => {
            mockContext = createMockHandlerContext();
            jest.clearAllMocks();
        });

        describe('happy path', () => {
            it('should authenticate successfully when not authenticated (normal flow)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager!.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.testDeveloperPermissions as jest.Mock).mockResolvedValue({
                    hasPermissions: true,
                });

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.authManager!.login).toHaveBeenCalledWith(false);
                expect(mockContext.sharedState.isAuthenticating).toBe(false);
            });

            it('should skip authentication when already authenticated and force=false', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                const result = await handleAuthenticate(mockContext, { force: false });

                expect(result.success).toBe(true);
                expect(mockContext.authManager!.login).not.toHaveBeenCalled();
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
                    'auth-status',
                    expect.objectContaining({
                        message: 'Already signed in',
                    })
                );
            });

            it('should force re-authentication when force=true', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext, { force: true });

                expect(result.success).toBe(true);
                expect(mockContext.authManager!.login).toHaveBeenCalledWith(true);
            });

            it('should send "opening browser" message before login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager!.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.testDeveloperPermissions as jest.Mock).mockResolvedValue({
                    hasPermissions: true,
                });

                await handleAuthenticate(mockContext);

                // Updated: Now uses constant message with subMessage indicating browser opening
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Signing in...',
                    subMessage: 'Opening browser...',
                    isAuthenticated: false,
                });
            });

            it('should fetch and auto-select single org after login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
                expect(mockContext.authManager!.selectOrganization).toHaveBeenCalledWith(mockOrg.id);
            });

            it('should NOT validate org during login (no validation calls)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                // No validation calls during login
                expect(mockContext.authManager!.validateAndClearInvalidOrgContext).not.toHaveBeenCalled();
            });

            it('should NOT test developer permissions during login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                // No permission checks during login
                expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
            });

            it('should return success with "All set!" when single org auto-selected', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
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

            it('should NOT clear cache after normal login (only on force)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // clearCache() only called with force=true
                expect(mockContext.authManager!.clearCache).not.toHaveBeenCalled();
            });

            it('should log performance metrics for login flow', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Auth completed metric
                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringMatching(/Authentication completed successfully after \d+ms/)
                );
                // Post-login setup metric
                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringMatching(/Post-login setup completed in \d+ms/)
                );
            });
        });

        describe('post-login organization handling', () => {
            it('should initialize SDK after successful login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // SDK is initialized after login
                expect(mockContext.authManager!.ensureSDKInitialized).toHaveBeenCalled();
            });

            it('should fetch organization list after login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Org list is fetched after login
                expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
            });

            it('should auto-select when single organization available', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Single org is auto-selected
                expect(mockContext.authManager!.selectOrganization).toHaveBeenCalledWith(mockOrg.id);
                expect(mockContext.authManager!.setCachedOrganization).toHaveBeenCalledWith(mockOrg);
            });

            it('should NOT validate organization access during login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Validation is NOT done during login
                expect(mockContext.authManager!.validateAndClearInvalidOrgContext).not.toHaveBeenCalled();
            });

            it('should NOT check developer permissions during login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Permission check is NOT done during login
                expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
            });

            it('should NOT set orgRejectedFlag when single org auto-selected', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // No rejection flag when org is selected
                expect(mockContext.authManager!.setOrgRejectedFlag).not.toHaveBeenCalled();
            });

            it('should log post-login setup completion', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Log should show post-login setup
                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringMatching(/Post-login setup completed in \d+ms/)
                );
            });
        });

        describe('error handling', () => {
            it('should reject duplicate authentication requests (isAuthenticating = true)', async () => {
                mockContext.sharedState.isAuthenticating = true;

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(false);
                expect(mockContext.logger.warn).toHaveBeenCalledWith(
                    expect.stringMatching(/Authentication already in progress/)
                );
                expect(mockContext.authManager!.login).not.toHaveBeenCalled();
            });

            it('should handle login() failure (timeout scenario)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(false);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(false);
                expect(mockContext.logger.warn).toHaveBeenCalledWith(
                    expect.stringMatching(/Authentication timed out after \d+ms/)
                );
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'timeout',
                    message: 'Sign-in timed out',
                    subMessage: 'The browser window may have been closed. Please try again.',
                });
            });

            it('should handle exception during authentication', async () => {
                const error = new Error('Network error');
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(false);
                expect(mockContext.logger.error).toHaveBeenCalledWith(
                    expect.stringMatching(/Failed to start authentication after \d+ms:/),
                    error
                );
            });

            it('should send error message when exception occurs', async () => {
                const error = new Error('Authentication failed');
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('authError', {
                    error: 'Authentication failed',
                });
            });

            it('should reset isAuthenticating flag on error', async () => {
                const error = new Error('Test error');
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                expect(mockContext.sharedState.isAuthenticating).toBe(false);
            });

            it('should return success even if permission check would fail (deferred)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);

                const result = await handleAuthenticate(mockContext);

                // Permission check is deferred, so login still succeeds
                expect(result.success).toBe(true);
                // Permission check is NOT run during login (deferred)
                expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
                // setOrgRejectedFlag is NOT called (no validation during login)
                expect(mockContext.authManager!.setOrgRejectedFlag).not.toHaveBeenCalled();
            });

            it('should NOT check permissions during login (deferred to next step)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext);

                // Permission errors won't be logged during login (deferred)
                expect(mockContext.logger.error).not.toHaveBeenCalledWith(
                    expect.stringMatching(/User lacks Developer permissions/)
                );
                // Permission check not run at all
                expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
            });
        });

        describe('edge cases', () => {
            it('should detect and log multiple orgs after login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

                await handleAuthenticate(mockContext);

                // Org list is fetched after login
                expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringMatching(/\d+ organizations available, user must select/)
                );
            });

            it('should detect and log zero orgs after login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);

                await handleAuthenticate(mockContext);

                // Org list is fetched after login
                expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
                expect(mockContext.logger.warn).toHaveBeenCalledWith(
                    expect.stringMatching(/No organizations accessible for this user/)
                );
            });

            it('should require org selection when multiple orgs available', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
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

            it('should show orgLacksAccess when zero orgs available', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
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

            it('should NOT validate org during login', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Validation is NOT done during login
                expect(mockContext.authManager!.validateAndClearInvalidOrgContext).not.toHaveBeenCalled();
            });

            it('should handle payload = undefined (default force = false)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                await handleAuthenticate(mockContext);

                expect(mockContext.authManager!.login).not.toHaveBeenCalled();
            });

            it('should handle payload.force = undefined (default false)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                await handleAuthenticate(mockContext, {});

                expect(mockContext.authManager!.login).not.toHaveBeenCalled();
            });

            it('should handle forced login with multiple orgs but none selected', async () => {
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

                await handleAuthenticate(mockContext, { force: true });

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

            it('should handle orgLacksAccess flag after forced login', async () => {
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);

                await handleAuthenticate(mockContext, { force: true });

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

            it('should NOT check permissions during login (cache unchanged)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext);

                // Permission check is deferred, so no cache clearing for permission failures
                expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
                // clearCache() is not called (force=false by default)
                expect(mockContext.authManager!.clearCache).not.toHaveBeenCalled();
            });

            it('should send "opening browser" message with force flag text', async () => {
                (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.testDeveloperPermissions as jest.Mock).mockResolvedValue({
                    hasPermissions: true,
                });
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);

                await handleAuthenticate(mockContext, { force: true });

                // Updated: Now uses constant message with subMessage for force mode
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Signing in...',
                    subMessage: 'Starting fresh login...',
                    isAuthenticated: false,
                });
            });

            it('should initialize SDK when skipping authentication (already authenticated)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                await handleAuthenticate(mockContext, { force: false });

                expect(mockContext.authManager!.ensureSDKInitialized).toHaveBeenCalled();
            });

            it('should handle orgLacksAccess when skipping auth (already authenticated but no org)', async () => {
                (mockContext.authManager!.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(true);

                await handleAuthenticate(mockContext, { force: false });

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: 'Organization selection required',
                    subMessage: 'Organization no longer accessible or lacks App Builder access',
                    requiresOrgSelection: true,
                    orgLacksAccess: true,
                });
            });
        });
});
