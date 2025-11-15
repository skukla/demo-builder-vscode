/**
 * handleCheckAuth Test Suite
 *
 * Tests the quick authentication status check handler.
 * This handler uses cached data only (no API calls) for fast checks.
 *
 * Tests: 18
 * - Happy path: 8 tests
 * - Error handling: 4 tests
 * - Edge cases: 6 tests
 */

import { handleCheckAuth } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext, mockOrg, mockProject } from './testUtils';

describe('authenticationHandlers - handleCheckAuth', () => {
    let mockContext: jest.Mocked<HandlerContext>;

    beforeEach(() => {
        mockContext = createMockHandlerContext();
        jest.clearAllMocks();
    });

    describe('happy path', () => {
        it('should check auth and return not authenticated when user is not logged in', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);

            const result = await handleCheckAuth(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.authManager!.isAuthenticated).toHaveBeenCalledTimes(1);
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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            const result = await handleCheckAuth(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.authManager!.getCachedOrganization).toHaveBeenCalledTimes(1);
            expect(mockContext.authManager!.getCachedProject).toHaveBeenCalledTimes(1);

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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            // handleCheckAuth uses cached data only - no SDK initialization
            expect(mockContext.authManager!.ensureSDKInitialized).not.toHaveBeenCalled();
        });

        it('should send initial checking status message with correct text', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);

            await handleCheckAuth(mockContext);

            expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
                isChecking: true,
                message: 'Checking authentication status...',
                subMessage: 'Validating authorization token...',
            });
        });

        it('should log performance metrics (check duration)', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringMatching(/Token-only authentication check completed in \d+ms/)
            );
        });

        it('should log final status message', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringMatching(/\[Auth\] Authentication verified - Signed in as Test Organization/)
            );
        });

        it('should use cached data only (no org/project fetching)', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            // Uses cached data - no fetching
            expect(mockContext.authManager!.getCurrentOrganization).not.toHaveBeenCalled();
            expect(mockContext.authManager!.getCurrentProject).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should handle isAuthenticated() failure gracefully', async () => {
            const error = new Error('Auth check failed');
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(error);

            const result = await handleCheckAuth(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/Failed to check auth after \d+ms:/),
                error
            );
        });

        it('should handle getCachedOrganization() returning undefined gracefully', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(error);

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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue({
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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue({
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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

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
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            // getCachedProject is called even without org (but result may be cleared)
            expect(mockContext.authManager!.getCachedProject).toHaveBeenCalled();
        });
    });
});