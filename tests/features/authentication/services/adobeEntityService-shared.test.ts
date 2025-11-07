/**
 * AdobeEntityService Shared Tests
 *
 * Tests for shared operations in AdobeEntityService.
 * Covers context management and cross-entity operations.
 */

import { setupMocks, mockOrgs, mockProjects, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');

import { getLogger } from '@/core/logging';

describe('AdobeEntityService - Shared Operations', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        // Setup mocked module functions
        (getLogger as jest.Mock).mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

        testMocks = setupMocks();
    });

    describe('getCurrentContext()', () => {
        it('should return full context with all entities', async () => {
            const { service, mockCacheManager } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(mockOrgs[0]);
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: { id: 'ws1', name: 'Production' }
            } as ReturnType<typeof mockCacheManager.getCachedConsoleWhere>);

            const result = await service.getCurrentContext();

            expect(result.org).toEqual(mockOrgs[0]);
            expect(result.project).toEqual(mockProjects[0]);
            expect(result.workspace).toBeDefined();
            // workspace can be string or object, check if it's an object with id
            if (typeof result.workspace === 'object' && result.workspace !== null) {
                expect(result.workspace.id).toBe('ws1');
            }
        });

        it('should return partial context if some entities missing', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(mockOrgs[0]);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentContext();

            expect(result.org).toEqual(mockOrgs[0]);
            expect(result.project).toBeUndefined();
            expect(result.workspace).toBeUndefined();
        });

        it('should return empty context if all entities missing', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentContext();

            expect(result.org).toBeUndefined();
            expect(result.project).toBeUndefined();
            expect(result.workspace).toBeUndefined();
        });
    });
});