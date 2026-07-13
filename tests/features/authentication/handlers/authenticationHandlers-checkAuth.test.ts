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
import type { AdobeOrg } from '@/features/authentication/services/types';
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
                tokenExpiresIn: undefined,
                tokenExpiringSoon: false,
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
                tokenExpiresIn: undefined,
                tokenExpiringSoon: false,
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
                tokenExpiresIn: undefined,
                tokenExpiringSoon: false,
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

            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringMatching(/\[Auth\] Check complete in \d+ms: authenticated=true/)
            );
        });

        it('should log final status message', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringMatching(
                    /\[Auth\] Authentication verified - Signed in as Test Organization/
                )
            );
        });

        it('should use cached data when available (no CLI fetching)', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            // Uses cached data - no CLI fetching when cache hit
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

        it('should resolve org from the token and OMIT the project when cache is empty', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(
                undefined
            );
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            const result = await handleCheckAuth(mockContext);

            // Org comes from the token (getOrganizations), not the stale CLI console org.
            expect(mockContext.authManager!.getOrganizations).toHaveBeenCalledTimes(1);
            expect(mockContext.authManager!.getCurrentOrganization).not.toHaveBeenCalled();
            // The project is OMITTED on a cache miss: we never pair the freshly
            // resolved token org with getCurrentProject() (the stale CLI console
            // project), which could belong to a DIFFERENT org.
            expect(mockContext.authManager!.getCurrentProject).not.toHaveBeenCalled();

            // Should succeed - token reaches no org yet, so selection is required.
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

        it('should pair the token org with NO project (never a stale one) on cache miss', async () => {
            const tokenOrg = { id: 'token-org', code: 'TOKENORG@AdobeOrg', name: 'Token Org' };
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(
                undefined
            );
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([tokenOrg]);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            const result = await handleCheckAuth(mockContext);

            expect(result.success).toBe(true);
            // Token org cached for the fast path, and NO stale project is fetched/paired.
            expect(mockContext.authManager!.setCachedOrganization).toHaveBeenCalledWith(tokenOrg);
            expect(mockContext.authManager!.getCurrentProject).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
                'auth-status',
                expect.objectContaining({
                    authenticated: true,
                    organization: tokenOrg,
                    project: undefined,
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
                code: 'NETWORK',
                message: 'Connection problem',
                subMessage:
                    "Can't reach Adobe services. Check your internet connection and try again.",
            });
        });
    });

    describe('org source on cache miss (token org is the truth)', () => {
        // The token/IMS org is `getOrganizations()[0]` — the org the current token
        // actually reaches. The CLI console org (`getCurrentOrganization()`) is
        // token-INDEPENDENT and goes stale after an org switch, so it must NOT be the
        // displayed/cached org on a cache miss.
        const tokenOrg: AdobeOrg = { id: 'token-org', code: 'TOKEN@AdobeOrg', name: 'Token Org' };
        const consoleOrg: AdobeOrg = {
            id: 'console-org',
            code: 'CONSOLE@AdobeOrg',
            name: 'Stale Console Org',
        };

        it('resolves the TOKEN org (getOrganizations()[0]), not the CLI console org, on a cache miss', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(
                undefined
            );
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([tokenOrg]);
            (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(
                consoleOrg
            );
            (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(undefined);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            // The token org wins — it is what gets displayed.
            expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
                'auth-status',
                expect.objectContaining({ organization: tokenOrg })
            );
            // The stale CLI console org must NOT be consulted for the display org.
            expect(mockContext.authManager!.getCurrentOrganization).not.toHaveBeenCalled();
        });

        it('caches the resolved token org on a cache miss', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(
                undefined
            );
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([tokenOrg]);
            (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(undefined);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            expect(mockContext.authManager!.setCachedOrganization).toHaveBeenCalledWith(tokenOrg);
        });

        it('does NOT resolve from the token on a cache HIT (perf: no getOrganizations call)', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(mockOrg);
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(mockProject);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            // The <1s quick-auth-check must stay cache-first: warm cache => no token resolve.
            expect(mockContext.authManager!.getOrganizations).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
                'auth-status',
                expect.objectContaining({ organization: mockOrg })
            );
        });
    });

    describe('edge cases', () => {
        it('should resolve org from the token and project from CLI when cache is empty (post-restart scenario)', async () => {
            // Critical UX: extension restart with a valid token. The displayed org must be
            // the TOKEN org (getOrganizations()[0]), not the CLI's persisted console org
            // (which can be stale after an org switch). The project is OMITTED here —
            // we never pair the token org with the stale CLI console project.
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(
                undefined
            ); // Cache empty (restart)
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]); // Token reaches this org
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            const result = await handleCheckAuth(mockContext);

            expect(result.success).toBe(true);

            // Org from the token; project OMITTED. Stale console org must NOT be read.
            expect(mockContext.authManager!.getOrganizations).toHaveBeenCalledTimes(1);
            expect(mockContext.authManager!.getCurrentOrganization).not.toHaveBeenCalled();
            expect(mockContext.authManager!.getCurrentProject).not.toHaveBeenCalled();

            // Should show token org; project omitted (re-selected downstream).
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
                tokenExpiresIn: undefined,
                tokenExpiringSoon: false,
            });

            // Should log final auth status
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringMatching(
                    /\[Auth\] Authentication verified - Signed in as Test Organization/
                )
            );
        });

        it('should handle authenticated but no cached org and no persisted org', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(
                undefined
            );
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(
                undefined
            );
            (mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(undefined);
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
                tokenExpiresIn: undefined,
                tokenExpiringSoon: false,
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
                tokenExpiresIn: undefined,
                tokenExpiringSoon: false,
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
                tokenExpiresIn: undefined,
                tokenExpiringSoon: false,
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
                tokenExpiresIn: undefined,
                tokenExpiringSoon: false,
            });
        });

        it('should NOT fetch a project from the CLI on cache miss (avoids mispairing)', async () => {
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.getCachedOrganization as jest.Mock).mockReturnValue(
                undefined
            );
            (mockContext.authManager!.getCachedProject as jest.Mock).mockReturnValue(undefined);
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);
            (mockContext.authManager!.getValidationCache as jest.Mock).mockReturnValue(null);

            await handleCheckAuth(mockContext);

            // The stale CLI console project is never fetched on a cache miss — we
            // don't pair the token org with a possibly-foreign-org project.
            expect(mockContext.authManager!.getCurrentProject).not.toHaveBeenCalled();
        });
    });
});
