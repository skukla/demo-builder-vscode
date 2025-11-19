import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import {
    mockLogger,
    createMockOrg,
    createMockProject,
    createMockWorkspace,
} from './authCacheManager.testUtils';

/**
 * AuthCacheManager Integration Test Suite
 *
 * Tests integration scenarios and concurrent operations:
 * - Independent cache operations
 * - Rapid cache updates
 * - Cache clear during active caching
 *
 * Total tests: 3
 */

// Mock getLogger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('AuthCacheManager - Integration Scenarios', () => {
    let cacheManager: AuthCacheManager;

    beforeEach(() => {
        cacheManager = new AuthCacheManager();
        jest.clearAllMocks();
    });

    describe('cache interactions', () => {
        it('should allow independent cache operations', () => {
            const mockOrg = createMockOrg();
            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedAuthStatus(true);
            cacheManager.setValidationCache('org123', true);

            expect(cacheManager.getCachedOrganization()).toBeDefined();
            expect(cacheManager.getCachedAuthStatus().isAuthenticated).toBe(true);
            expect(cacheManager.getValidationCache()).toBeDefined();
        });

        it('should handle rapid cache updates', () => {
            for (let i = 0; i < 100; i++) {
                cacheManager.setCachedAuthStatus(i % 2 === 0);
            }

            const result = cacheManager.getCachedAuthStatus();
            expect(result.isAuthenticated).toBe(false); // Last value
        });

        it('should handle cache clear during active caching', () => {
            const mockOrg = createMockOrg();
            const mockProject = createMockProject();
            const mockWorkspace = createMockWorkspace();

            cacheManager.setCachedOrganization(mockOrg);
            cacheManager.setCachedProject(mockProject);

            cacheManager.clearSessionCaches();

            cacheManager.setCachedWorkspace(mockWorkspace);

            expect(cacheManager.getCachedOrganization()).toBeUndefined();
            expect(cacheManager.getCachedProject()).toBeUndefined();
            expect(cacheManager.getCachedWorkspace()).toBeDefined();
        });
    });
});
