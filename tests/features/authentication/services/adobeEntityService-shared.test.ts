/**
 * AdobeEntityService Shared Tests
 *
 * Tests for shared operations in AdobeEntityService.
 * Covers context management and cross-entity operations.
 */

import { setupMocks, mockOrgs, mockProjects, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only

import { getLogger } from '@/core/logging/debugLogger';
import { createMockLogger } from '../../../helpers/loggerFake';

describe('AdobeEntityService - Shared Operations', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        // Setup mocked module functions
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());

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
            // `workspace` may be a string or an object. The fixture supplies an
            // object, so read the id through a shape that admits both rather than
            // guarding — the old `if` meant a regression to a bare string passed.
            expect(result.workspace).toBeDefined();
            const workspaceId =
                typeof result.workspace === 'object' && result.workspace !== null
                    ? result.workspace.id
                    : result.workspace;
            expect(workspaceId).toBe('ws1');
        });

        it('should return partial context if some entities missing', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(mockOrgs[0]);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
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
            mockCommandExecutor.execute.mockResolvedValue({
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