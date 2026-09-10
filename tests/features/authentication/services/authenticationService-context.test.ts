import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import {
    createSuccessResult,
    createOrgContextResult,
    createProjectListResult,
    mockOrg,
    mockProject,
    setupAuthServiceSuite,
} from './authenticationService.testUtils';
import { getActiveOrgContext } from '@/features/authentication/services/orgContextEnv';
import { TokenManager } from '@/features/authentication/services/tokenManager';

/**
 * AuthenticationService - Context Validation and SDK Test Suite
 *
 * Tests SDK management and context validation:
 * - SDK initialization (ensureSDKInitialized)
 * - Org context validation (validateAndClearInvalidOrgContext)
 * - Developer permissions testing (testDeveloperPermissions)
 * - Integration scenarios with caching
 *
 * Total tests: 6
 */

// Only mock external dependencies
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');

/**
 * The CLI token store, read IN PROCESS by `TokenManager`. Mocked here rather
 * than in testUtils because `jest.mock` hoists only within its own module.
 */
const mockStoredToken: { value: { token?: string; expiry?: number } | undefined } = {
    value: undefined,
};
jest.mock('@adobe/aio-lib-core-config', () => ({
    get: jest.fn(() => mockStoredToken.value),
    // The real reader reloads before every get (the library serves a snapshot
    // otherwise). Declared here so this mock is the real module's shape: without
    // it, the reader's reload throws and quietly runs its fallback path instead.
    reload: jest.fn(),
}));

import { getLogger } from '@/core/logging/debugLogger';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { createEntityServices } from '@/features/authentication/services/adobeEntityService';

describe('AuthenticationService - Context Validation and SDK', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;

    let sdkOnlyOrgs: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        sdkOnlyOrgs = jest.fn().mockResolvedValue([mockOrg]);
        ({
            authService,
            commandExecutor: mockCommandExecutor,
            sdkClient: mockSDKClient,
        } = setupAuthServiceSuite({
            AdobeSDKClient: AdobeSDKClient as unknown as jest.MockedClass<
                typeof AdobeSDKClient
            >,
            createEntityServices: createEntityServices as jest.Mock,
            getLogger: getLogger as jest.Mock,
            fetcher: {
                getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
                getOrganizationsSdkOnly: sdkOnlyOrgs,
            },
        }));
    });

    describe('SDK management', () => {
        it('should ensure SDK is initialized', async () => {
            // Given: SDK client is configured
            mockSDKClient.ensureInitialized.mockResolvedValue(true);

            // When: ensuring SDK initialization
            const result = await authService.ensureSDKInitialized();

            // Then: should return success
            expect(result).toBe(true);
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
        });
    });

    describe('org context validation', () => {
        // Phase 4a: the ambient `validateAndClearInvalidOrgContext` wrapper was
        // removed (org context is no longer a mutated global to validate/clear).
        // Org reachability is now resolved per-op via ensureOrgContext.

        it('should test developer permissions via app list', async () => {
            // Given: Valid org with apps
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult(JSON.stringify([{ name: 'App 1', app_id: 'app1' }]))
            );

            // When: testing developer permissions
            const result = await authService.testDeveloperPermissions();

            // Then: should return permission status
            expect(result).toHaveProperty('hasPermissions');
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio app list --json',
                expect.any(Object)
            );
        });

        it('targets the developer-permission probe at the token org (withOrgContext)', async () => {
            // Cache miss → token org resolved via getOrganizationsSdkOnly()[0]. The
            // `aio app list` probe must run under THAT org's context, not the
            // ambient (possibly stale) CLI selection.
            let activeDuringProbe: { orgId?: string } | undefined;
            mockCommandExecutor.execute.mockImplementation(async () => {
                activeDuringProbe = getActiveOrgContext();
                return createSuccessResult(JSON.stringify([]));
            });

            await authService.testDeveloperPermissions();

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio app list --json',
                expect.any(Object)
            );
            expect(activeDuringProbe?.orgId).toBe(mockOrg.id);
        });
    });

    describe('integration scenarios', () => {
        it('should handle full authentication flow with caching', async () => {
            // Given: First authentication check with valid token
            const futureExpiry = Date.now() + 3600000;
            mockStoredToken.value = { token: 'x'.repeat(150), expiry: futureExpiry };
            mockCommandExecutor.execute
                .mockResolvedValueOnce(createOrgContextResult())
                .mockResolvedValueOnce(createProjectListResult());

            // When: Multiple authentication checks
            const result1 = await authService.isAuthenticated();

            // The second check rides the inspection cache; the store is unchanged.
            const result2 = await authService.isAuthenticated();

            // Then: Both should succeed
            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });
    });

    describe('the developer-permission probe without a token org', () => {
        it('a cache miss the SDK cannot answer still runs the probe, with no org target', async () => {
            sdkOnlyOrgs.mockResolvedValue(undefined);
            let activeDuringProbe: { orgId?: string } | undefined = { orgId: 'sentinel' };
            mockCommandExecutor.execute.mockImplementation(async () => {
                activeDuringProbe = getActiveOrgContext();
                return createSuccessResult(JSON.stringify([]));
            });

            await expect(authService.testDeveloperPermissions()).resolves.toHaveProperty(
                'hasPermissions',
            );

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio app list --json',
                expect.any(Object),
            );
            expect(activeDuringProbe).toBeUndefined();
        });
    });

    describe('cache passthroughs', () => {
        it('exposes the one cache manager the service reads and writes through', () => {
            authService.getCacheManager().setCachedOrganization(mockOrg);
            expect(authService.getCachedOrganization()).toEqual(mockOrg);

            authService.setCachedOrganization(undefined);
            expect(authService.getCacheManager().getCachedOrganization()).toBeUndefined();
        });

        it('reads the cached project and validation result from that same cache', () => {
            const cache = authService.getCacheManager();
            cache.setCachedProject(mockProject);
            cache.setValidationCache(mockOrg.id, false);

            expect(authService.getCachedProject()).toEqual(mockProject);
            expect(authService.getValidationCache()).toBeDefined();
            expect(authService.getValidationCache()).toEqual(cache.getValidationCache());
        });

        it('the org-rejected flag round-trips', () => {
            expect(authService.wasOrgClearedDueToValidation()).toBe(false);

            authService.setOrgRejectedFlag();

            expect(authService.wasOrgClearedDueToValidation()).toBe(true);
        });

        it('exposes the token manager the auth checks answer through', () => {
            expect(authService.getTokenManager()).toBeInstanceOf(TokenManager);
        });
    });
});
