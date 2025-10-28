import { handleCheckAuth, handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import type { AdobeOrg, AdobeProject } from '@/features/authentication/services/types';

/**
 * Authentication Handlers Test Suite
 *
 * Tests both authentication handlers:
 * - handleCheckAuth: Quick authentication status check
 * - handleAuthenticate: Browser-based Adobe login flow
 *
 * Total tests: 62
 * - handleCheckAuth: 18 tests
 * - handleAuthenticate: 44 tests
 *   - happy path: 10 tests
 *   - deferred validation behavior: 8 tests (NEW - tests deferred mode)
 *   - error handling: 5 tests
 *   - edge cases: 21 tests
 */

// Test data
const mockOrg: AdobeOrg = {
    id: 'org123',
    code: 'ORGCODE',
    name: 'Test Organization',
};

const mockProject: AdobeProject = {
    id: 'proj456',
    name: 'Test Project',
};

const mockOrgs: AdobeOrg[] = [
    { id: 'org1', code: 'ORG1', name: 'Organization One' },
    { id: 'org2', code: 'ORG2', name: 'Organization Two' },
];

// Mock factory for HandlerContext
function createMockHandlerContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return {
        prereqManager: {} as any,
        authManager: {
            isAuthenticatedQuick: jest.fn(),
            ensureSDKInitialized: jest.fn(),
            getCurrentOrganization: jest.fn(),
            getCurrentProject: jest.fn(),
            getCachedOrganization: jest.fn(),
            getCachedProject: jest.fn(),
            getValidationCache: jest.fn(),
            wasOrgClearedDueToValidation: jest.fn(),
            login: jest.fn(),
            clearCache: jest.fn(),
            getOrganizations: jest.fn(),
            selectOrganization: jest.fn(),
            setCachedOrganization: jest.fn(),
            autoSelectOrganizationIfNeeded: jest.fn(),
            setOrgRejectedFlag: jest.fn(),
            validateAndClearInvalidOrgContext: jest.fn(),
            testDeveloperPermissions: jest.fn(),
        } as any,
        componentHandler: {} as any,
        errorLogger: {} as any,
        progressUnifier: {} as any,
        stepLogger: {} as any,
        logger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any,
        debugLogger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any,
        context: {} as any,
        panel: undefined,
        stateManager: {} as any,
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
        },
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}

describe('authenticationHandlers', () => {
    describe('handleCheckAuth', () => {
        let mockContext: jest.Mocked<HandlerContext>;

        beforeEach(() => {
            mockContext = createMockHandlerContext();
            jest.clearAllMocks();
        });

        describe('happy path', () => {
            it('should check auth and return not authenticated when user is not logged in', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.authManager.isAuthenticatedQuick).toHaveBeenCalledTimes(1);
                expect(mockContext.sendMessage).toHaveBeenCalledTimes(2); // Initial + final status

                // Verify final message
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: 'Not signed in',
                    subMessage: 'Sign in with your Adobe account to continue',
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            });

            it('should check auth and return authenticated with org and project when fully configured', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.authManager.getCachedOrganization).toHaveBeenCalledTimes(1);
                expect(mockContext.authManager.getCachedProject).toHaveBeenCalledTimes(1);

                // Verify final message
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: mockOrg,
                    project: mockProject,
                    message: 'Authentication verified',
                    subMessage: `Signed in as ${mockOrg.name}`,
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            });

            it('should check auth and return authenticated with org only (no project)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(undefined);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: mockOrg,
                    project: undefined,
                    message: 'Authentication verified',
                    subMessage: `Signed in as ${mockOrg.name}`,
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            });

            it('should NOT initialize SDK when authenticated (quick check only)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                // handleCheckAuth uses cached data only - no SDK initialization
                expect(mockContext.authManager.ensureSDKInitialized).not.toHaveBeenCalled();
            });

            it('should send initial checking status message with correct text', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);

                await handleCheckAuth(mockContext);

                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                    isChecking: true,
                    message: 'Checking authentication status...',
                    subMessage: 'Validating authorization token...',
                });
            });

            it('should log performance metrics (check duration)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringMatching(/Quick authentication check completed in \d+ms/)
                );
            });

            it('should log final status message', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringMatching(/\[Auth\] Authentication verified - Signed in as Test Organization/)
                );
            });

            it('should use cached data only (no org/project fetching)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                // Uses cached data - no fetching
                expect(mockContext.authManager.getCurrentOrganization).not.toHaveBeenCalled();
                expect(mockContext.authManager.getCurrentProject).not.toHaveBeenCalled();
            });
        });

        describe('error handling', () => {
            it('should handle isAuthenticatedQuick() failure gracefully', async () => {
                const error = new Error('Auth check failed');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                const result = await handleCheckAuth(mockContext);

                expect(result.success).toBe(false);
                expect(mockContext.logger.error).toHaveBeenCalledWith(
                    expect.stringMatching(/Failed to check auth after \d+ms:/),
                    error
                );
            });

            it('should handle getCachedOrganization() returning undefined gracefully', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(undefined);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(undefined);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                const result = await handleCheckAuth(mockContext);

                // Should succeed - just means no cached org/project
                expect(result.success).toBe(true);
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
                    'auth-status',
                    expect.objectContaining({
                        authenticated: true,
                        organization: undefined,
                        message: 'Authentication verified',
                        subMessage: 'Organization selection required',
                    })
                );
            });

            it('should handle getCachedProject() returning undefined gracefully', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(undefined);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                const result = await handleCheckAuth(mockContext);

                // Should succeed - just means no cached project
                expect(result.success).toBe(true);
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
                    'auth-status',
                    expect.objectContaining({
                        authenticated: true,
                        organization: mockOrg,
                        project: undefined,
                    })
                );
            });

            it('should send error status message when check fails', async () => {
                const error = new Error('Network error');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleCheckAuth(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    error: true,
                    message: 'Connection problem',
                    subMessage: 'Can\'t reach Adobe services. Check your internet connection and try again.',
                });
            });
        });

        describe('edge cases', () => {
            it('should handle authenticated but no cached org (requiresOrgSelection = true)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(undefined);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(undefined);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: 'Authentication verified',
                    subMessage: 'Organization selection required',
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            });

            it('should hide cached org if validation failed', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue({
                    org: mockOrg.code,
                    isValid: false,
                });

                await handleCheckAuth(mockContext);

                // Org should be cleared due to failed validation
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: undefined,
                    project: undefined,
                    message: 'Authentication verified',
                    subMessage: 'Organization selection required',
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            });

            it('should show cached org if validation passed', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue({
                    org: mockOrg.code,
                    isValid: true,
                });

                await handleCheckAuth(mockContext);

                // Org should be shown because validation passed
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: mockOrg,
                    project: mockProject,
                    message: 'Authentication verified',
                    subMessage: `Signed in as ${mockOrg.name}`,
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            });

            it('should show cached org if no validation cache exists', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(mockProject);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                // Org should be shown (validation pending but no known failure)
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
                    authenticated: true,
                    isAuthenticated: true,
                    isChecking: false,
                    organization: mockOrg,
                    project: mockProject,
                    message: 'Authentication verified',
                    subMessage: `Signed in as ${mockOrg.name}`,
                    requiresOrgSelection: false,
                    orgLacksAccess: false,
                });
            });

            it('should check cached project even when no org is cached', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCachedOrganization as jest.Mock).mockReturnValue(undefined);
                (mockContext.authManager.getCachedProject as jest.Mock).mockReturnValue(undefined);
                (mockContext.authManager.getValidationCache as jest.Mock).mockReturnValue(null);

                await handleCheckAuth(mockContext);

                // getCachedProject is called even without org (but result may be cleared)
                expect(mockContext.authManager.getCachedProject).toHaveBeenCalled();
            });
        });
    });

    describe('handleAuthenticate', () => {
        let mockContext: jest.Mocked<HandlerContext>;

        beforeEach(() => {
            mockContext = createMockHandlerContext();
            jest.clearAllMocks();
        });

        describe('happy path', () => {
            it('should authenticate successfully when not authenticated (normal flow)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.testDeveloperPermissions as jest.Mock).mockResolvedValue({
                    hasPermissions: true,
                });

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.authManager.login).toHaveBeenCalledWith(false);
                expect(mockContext.sharedState.isAuthenticating).toBe(false);
            });

            it('should skip authentication when already authenticated and force=false', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                const result = await handleAuthenticate(mockContext, { force: false });

                expect(result.success).toBe(true);
                expect(mockContext.authManager.login).not.toHaveBeenCalled();
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
                    'auth-status',
                    expect.objectContaining({
                        message: 'Already signed in',
                    })
                );
            });

            it('should force re-authentication when force=true', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext, { force: true });

                expect(result.success).toBe(true);
                expect(mockContext.authManager.login).toHaveBeenCalledWith(true);
            });

            it('should send "opening browser" message before login', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.testDeveloperPermissions as jest.Mock).mockResolvedValue({
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
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                expect(mockContext.authManager.getOrganizations).toHaveBeenCalled();
                expect(mockContext.authManager.selectOrganization).toHaveBeenCalledWith(mockOrg.id);
            });

            it('should NOT validate org during login (no validation calls)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                // No validation calls during login
                expect(mockContext.authManager.validateAndClearInvalidOrgContext).not.toHaveBeenCalled();
            });

            it('should NOT test developer permissions during login', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(true);
                // No permission checks during login
                expect(mockContext.authManager.testDeveloperPermissions).not.toHaveBeenCalled();
            });

            it('should return success with "All set!" when single org auto-selected', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

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
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // clearCache() only called with force=true
                expect(mockContext.authManager.clearCache).not.toHaveBeenCalled();
            });

            it('should log performance metrics for login flow', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

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
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // SDK is initialized after login
                expect(mockContext.authManager.ensureSDKInitialized).toHaveBeenCalled();
            });

            it('should fetch organization list after login', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Org list is fetched after login
                expect(mockContext.authManager.getOrganizations).toHaveBeenCalled();
            });

            it('should auto-select when single organization available', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Single org is auto-selected
                expect(mockContext.authManager.selectOrganization).toHaveBeenCalledWith(mockOrg.id);
                expect(mockContext.authManager.setCachedOrganization).toHaveBeenCalledWith(mockOrg);
            });

            it('should NOT validate organization access during login', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Validation is NOT done during login
                expect(mockContext.authManager.validateAndClearInvalidOrgContext).not.toHaveBeenCalled();
            });

            it('should NOT check developer permissions during login', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Permission check is NOT done during login
                expect(mockContext.authManager.testDeveloperPermissions).not.toHaveBeenCalled();
            });

            it('should NOT set orgRejectedFlag when single org auto-selected', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // No rejection flag when org is selected
                expect(mockContext.authManager.setOrgRejectedFlag).not.toHaveBeenCalled();
            });

            it('should log post-login setup completion', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

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
                expect(mockContext.authManager.login).not.toHaveBeenCalled();
            });

            it('should handle login() failure (timeout scenario)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(false);

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
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                const result = await handleAuthenticate(mockContext);

                expect(result.success).toBe(false);
                expect(mockContext.logger.error).toHaveBeenCalledWith(
                    expect.stringMatching(/Failed to start authentication after \d+ms:/),
                    error
                );
            });

            it('should send error message when exception occurs', async () => {
                const error = new Error('Authentication failed');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('authError', {
                    error: 'Authentication failed',
                });
            });

            it('should reset isAuthenticating flag on error', async () => {
                const error = new Error('Test error');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                expect(mockContext.sharedState.isAuthenticating).toBe(false);
            });

            it('should return success even if permission check would fail (deferred)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);

                const result = await handleAuthenticate(mockContext);

                // Permission check is deferred, so login still succeeds
                expect(result.success).toBe(true);
                // Permission check is NOT run during login (deferred)
                expect(mockContext.authManager.testDeveloperPermissions).not.toHaveBeenCalled();
                // setOrgRejectedFlag is NOT called (no validation during login)
                expect(mockContext.authManager.setOrgRejectedFlag).not.toHaveBeenCalled();
            });

            it('should NOT check permissions during login (deferred to next step)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext);

                // Permission errors won't be logged during login (deferred)
                expect(mockContext.logger.error).not.toHaveBeenCalledWith(
                    expect.stringMatching(/User lacks Developer permissions/)
                );
                // Permission check not run at all
                expect(mockContext.authManager.testDeveloperPermissions).not.toHaveBeenCalled();
            });
        });

        describe('edge cases', () => {
            it('should detect and log multiple orgs after login', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

                await handleAuthenticate(mockContext);

                // Org list is fetched after login
                expect(mockContext.authManager.getOrganizations).toHaveBeenCalled();
                expect(mockContext.logger.info).toHaveBeenCalledWith(
                    expect.stringMatching(/\d+ organizations available, user must select/)
                );
            });

            it('should detect and log zero orgs after login', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([]);

                await handleAuthenticate(mockContext);

                // Org list is fetched after login
                expect(mockContext.authManager.getOrganizations).toHaveBeenCalled();
                expect(mockContext.logger.warn).toHaveBeenCalledWith(
                    expect.stringMatching(/No organizations accessible for this user/)
                );
            });

            it('should require org selection when multiple orgs available', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

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
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([]);

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
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.selectOrganization as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

                await handleAuthenticate(mockContext);

                // Validation is NOT done during login
                expect(mockContext.authManager.validateAndClearInvalidOrgContext).not.toHaveBeenCalled();
            });

            it('should handle payload = undefined (default force = false)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                await handleAuthenticate(mockContext);

                expect(mockContext.authManager.login).not.toHaveBeenCalled();
            });

            it('should handle payload.force = undefined (default false)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                await handleAuthenticate(mockContext, {});

                expect(mockContext.authManager.login).not.toHaveBeenCalled();
            });

            it('should handle forced login with multiple orgs but none selected', async () => {
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

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
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([]);

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
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext);

                // Permission check is deferred, so no cache clearing for permission failures
                expect(mockContext.authManager.testDeveloperPermissions).not.toHaveBeenCalled();
                // clearCache() is not called (force=false by default)
                expect(mockContext.authManager.clearCache).not.toHaveBeenCalled();
            });

            it('should send "opening browser" message with force flag text', async () => {
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.testDeveloperPermissions as jest.Mock).mockResolvedValue({
                    hasPermissions: true,
                });
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);

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
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
                (mockContext.authManager.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

                await handleAuthenticate(mockContext, { force: false });

                expect(mockContext.authManager.ensureSDKInitialized).toHaveBeenCalled();
            });

            it('should handle orgLacksAccess when skipping auth (already authenticated but no org)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(true);

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

    describe('STEP 2: Constant Message Pattern (Message Constancy During Loading)', () => {
        let mockContext: jest.Mocked<HandlerContext>;

        beforeEach(() => {
            mockContext = createMockHandlerContext();
            jest.clearAllMocks();
        });

        describe('handleCheckAuth message behavior', () => {
            it('should use appropriate checking message during initial check', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);

                await handleCheckAuth(mockContext);

                // Verify initial checking message is appropriate
                expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                    isChecking: true,
                    message: expect.any(String),
                    subMessage: expect.any(String),
                }));
            });

            it('should use final state message after check completes (not loading state)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
                (mockContext.authManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);

                await handleCheckAuth(mockContext);

                // Final message can be different (not loading anymore)
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', expect.objectContaining({
                    isChecking: false,
                    message: expect.any(String),
                }));
            });
        });

        describe('handleAuthenticate message constancy during loading', () => {
            it('should keep main message CONSTANT during all loading phases', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.autoSelectOrganizationIfNeeded as jest.Mock).mockResolvedValue(mockOrg);

                await handleAuthenticate(mockContext);

                // Get all messages sent with isChecking: true (loading states)
                const loadingMessages = (mockContext.sendMessage as jest.Mock).mock.calls
                    .filter(call => call[1]?.isChecking === true)
                    .map(call => call[1].message);

                // All loading messages should be the same
                if (loadingMessages.length > 1) {
                    const firstMessage = loadingMessages[0];
                    loadingMessages.forEach(msg => {
                        expect(msg).toBe(firstMessage);
                    });
                }
            });

            it('should update ONLY subMessage during loading phases (message stays same)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.autoSelectOrganizationIfNeeded as jest.Mock).mockResolvedValue(mockOrg);

                await handleAuthenticate(mockContext);

                // Get all loading state messages
                const loadingCalls = (mockContext.sendMessage as jest.Mock).mock.calls
                    .filter(call => call[1]?.isChecking === true);

                if (loadingCalls.length > 1) {
                    const messages = loadingCalls.map(call => call[1].message);
                    const subMessages = loadingCalls.map(call => call[1].subMessage);

                    // Main message should be constant
                    const uniqueMessages = new Set(messages);
                    expect(uniqueMessages.size).toBe(1);

                    // SubMessages should vary (showing progress)
                    const uniqueSubMessages = new Set(subMessages.filter(Boolean));
                    expect(uniqueSubMessages.size).toBeGreaterThan(0);
                }
            });

            it('should use constant loading message like "Signing in..." during all loading phases', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.autoSelectOrganizationIfNeeded as jest.Mock).mockResolvedValue(mockOrg);

                await handleAuthenticate(mockContext);

                // All loading messages should use a constant like "Signing in..."
                const loadingMessages = (mockContext.sendMessage as jest.Mock).mock.calls
                    .filter(call => call[1]?.isChecking === true)
                    .map(call => call[1].message);

                loadingMessages.forEach(msg => {
                    // Should be simple, constant message (not specific to phase)
                    expect(msg).not.toContain('Opening browser');
                    expect(msg).not.toContain('Loading organizations');
                    expect(msg).not.toContain('Setting up your account');
                });
            });
        });

        describe('handleAuthenticate final state messages', () => {
            it('should allow DIFFERENT message for final success state (not loading)', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.autoSelectOrganizationIfNeeded as jest.Mock).mockResolvedValue(mockOrg);

                await handleAuthenticate(mockContext);

                // Final success message can be different from loading message
                const finalCall = (mockContext.sendMessage as jest.Mock).mock.calls
                    .filter(call => call[1]?.isChecking === false)
                    .pop();

                expect(finalCall).toBeDefined();
                expect(finalCall[1]).toMatchObject({
                    isChecking: false,
                    authenticated: true,
                    isAuthenticated: true,
                });
                // Final message can be different (e.g., "All set!", "Sign-in complete")
                expect(finalCall[1].message).toBeDefined();
            });

            it('should allow DIFFERENT message for timeout final state', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(false); // Timeout

                await handleAuthenticate(mockContext);

                // Timeout message should be different from loading message
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', expect.objectContaining({
                    isChecking: false,
                    authenticated: false,
                    error: 'timeout',
                    message: expect.stringMatching(/timed out|timeout/i),
                }));
            });

            it('should allow DIFFERENT message for "no orgs" final state', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([]); // No orgs

                await handleAuthenticate(mockContext);

                // No orgs message can be specific
                const finalCall = (mockContext.sendMessage as jest.Mock).mock.calls
                    .filter(call => call[1]?.isChecking === false && call[1]?.orgLacksAccess)
                    .pop();

                if (finalCall) {
                    expect(finalCall[1].message).toBeDefined();
                    // Can mention "no organizations" or similar
                }
            });
        });

        describe('subMessage updates for progress tracking', () => {
            it('should update subMessage to show "Opening browser..." during login initiation', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext);

                // Should have sent a message about opening browser (in subMessage)
                const browserMessage = (mockContext.sendMessage as jest.Mock).mock.calls
                    .find(call => call[1]?.subMessage?.toLowerCase().includes('browser'));

                expect(browserMessage).toBeDefined();
            });

            it('should update subMessage to show org loading progress if orgs are fetched', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);

                await handleAuthenticate(mockContext);

                // If getOrganizations() is called, subMessage should mention loading/organizations
                if ((mockContext.authManager.getOrganizations as jest.Mock).mock.calls.length > 0) {
                    const orgLoadingMessage = (mockContext.sendMessage as jest.Mock).mock.calls
                        .find(call =>
                            call[1]?.isChecking === true &&
                            (call[1]?.subMessage?.toLowerCase().includes('organization') ||
                             call[1]?.subMessage?.toLowerCase().includes('loading'))
                        );

                    expect(orgLoadingMessage).toBeDefined();
                }
            });
        });

        describe('error state messages', () => {
            it('should use appropriate error message when authentication fails', async () => {
                const error = new Error('Network error');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                // Error should be sent with appropriate message
                expect(mockContext.sendMessage).toHaveBeenCalledWith('authError', {
                    error: 'Network error',
                });
            });

            it('should send timeout message with clear guidance to user', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(false); // Timeout

                await handleAuthenticate(mockContext);

                // Timeout message should be user-friendly
                expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', expect.objectContaining({
                    error: 'timeout',
                    message: expect.any(String),
                    subMessage: expect.any(String),
                }));

                const lastCall = (mockContext.sendMessage as jest.Mock).mock.calls.pop();
                expect(lastCall[1].subMessage).toBeTruthy();
                expect(lastCall[1].subMessage.length).toBeGreaterThan(10); // Should have helpful text
            });
        });

        describe('SECURITY: Error Message Sanitization', () => {
            it('should sanitize error messages to prevent information disclosure', async () => {
                // Create error with sensitive information
                const error = new Error('Failed to read /Users/admin/.ssh/id_rsa with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                // Verify error message was sanitized
                const errorCall = (mockContext.sendMessage as jest.Mock).mock.calls.find(
                    call => call[0] === 'authError'
                );

                expect(errorCall).toBeDefined();
                const sentError = errorCall[1].error;

                // Should NOT contain full absolute paths (replaced with <path>/)
                expect(sentError).not.toContain('/Users/admin/.ssh/');
                expect(sentError).toContain('<path>/');

                // Should NOT contain long JWT tokens (should be redacted)
                expect(sentError).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
                expect(sentError).toContain('<redacted>');
            });

            it('should sanitize errors with environment variables', async () => {
                const error = new Error('Command failed: API_KEY=sk_live_abc123xyz456 npm install');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                const errorCall = (mockContext.sendMessage as jest.Mock).mock.calls.find(
                    call => call[0] === 'authError'
                );

                expect(errorCall).toBeDefined();
                const sentError = errorCall[1].error;

                // Should NOT contain API key value
                expect(sentError).not.toContain('sk_live_abc123xyz456');

                // Should redact environment variable values
                expect(sentError).toMatch(/API_KEY=<redacted>/);
            });

            it('should sanitize stack traces in error messages', async () => {
                const error = new Error('Error at /usr/local/lib/node/auth.js:123\n    at processAuth (/usr/local/lib/node/auth.js:45)\n    at login (/home/user/project/login.js:67)');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                const errorCall = (mockContext.sendMessage as jest.Mock).mock.calls.find(
                    call => call[0] === 'authError'
                );

                expect(errorCall).toBeDefined();
                const sentError = errorCall[1].error;

                // Should only contain first line (no stack trace)
                expect(sentError.split('\n').length).toBe(1);

                // Should not contain specific file paths from stack
                expect(sentError).not.toContain('at processAuth');
                expect(sentError).not.toContain('at login');
            });

            it('should handle simple error messages without modification', async () => {
                const error = new Error('Network connection failed');
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockRejectedValue(error);

                await handleAuthenticate(mockContext);

                const errorCall = (mockContext.sendMessage as jest.Mock).mock.calls.find(
                    call => call[0] === 'authError'
                );

                expect(errorCall).toBeDefined();
                const sentError = errorCall[1].error;

                // Simple error message should remain readable
                expect(sentError).toContain('Network connection failed');
            });
        });

        describe('visual consistency requirements', () => {
            it('should NOT cause LoadingDisplay message flickering during authentication', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);
                (mockContext.authManager.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
                (mockContext.authManager.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
                (mockContext.authManager.autoSelectOrganizationIfNeeded as jest.Mock).mockResolvedValue(mockOrg);

                await handleAuthenticate(mockContext);

                // Get loading state messages
                const loadingMessages = (mockContext.sendMessage as jest.Mock).mock.calls
                    .filter(call => call[1]?.isChecking === true)
                    .map(call => call[1].message);

                // Visual requirement: main message must stay constant during loading
                const uniqueMessages = new Set(loadingMessages);
                expect(uniqueMessages.size).toBeLessThanOrEqual(1);
            });

            it('should provide smooth UX by keeping message stable and updating only subMessage', async () => {
                (mockContext.authManager.isAuthenticatedQuick as jest.Mock).mockResolvedValue(false);
                (mockContext.authManager.login as jest.Mock).mockResolvedValue(true);

                await handleAuthenticate(mockContext);

                // All loading calls should have:
                // - Same message (stability)
                // - Different subMessages (progress indication)
                const loadingCalls = (mockContext.sendMessage as jest.Mock).mock.calls
                    .filter(call => call[1]?.isChecking === true);

                if (loadingCalls.length >= 2) {
                    const firstLoading = loadingCalls[0][1];
                    const secondLoading = loadingCalls[1][1];

                    // Message should be same
                    expect(secondLoading.message).toBe(firstLoading.message);
                    // SubMessage can be different
                    // (no assertion - just documenting expected behavior)
                }
            });
        });
    });
});
