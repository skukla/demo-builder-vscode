import { ensureContext, extractContextId } from '@/features/authentication/services/contextOperations';
import type { ContextOperationsDeps, ExpectedContext } from '@/features/authentication/services/contextOperations';
import type { CommandExecutor } from '@/core/shell';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { AdobeConsoleWhereResponse } from '@/features/authentication/services/types';
import { getLogger } from '@/core/logging';

jest.mock('@/core/logging');

/**
 * contextOperations - Context Comparison and Resolution Test Suite
 *
 * Tests the core logic for comparing CLI context with expected values,
 * specifically handling the CLI quirk where console.where returns:
 * - Sometimes: { project: { id: "123", name: "Foo" } } (object with ID)
 * - Sometimes: { project: "Foo" } (just the name as string)
 *
 * This test suite validates:
 * 1. ID extraction from different response formats
 * 2. Project name resolution using cache
 * 3. Proper comparison logic to avoid false positives
 * 4. Context re-selection only when truly needed
 *
 * Total tests: 9
 */

describe('contextOperations - Context Comparison and Resolution', () => {
    let mockDeps: ContextOperationsDeps;
    let mockCommandManager: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockSelectOrganization: jest.MockedFunction<(orgId: string) => Promise<boolean>>;
    let mockDoSelectProject: jest.MockedFunction<(projectId: string) => Promise<boolean>>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logger
        (getLogger as jest.Mock).mockReturnValue({
            debug: jest.fn(),
            trace: jest.fn(),
            error: jest.fn(),
        });

        // Mock command executor
        mockCommandManager = {
            execute: jest.fn(),
        } as any;

        // Mock cache manager
        mockCacheManager = {
            getCachedConsoleWhere: jest.fn(),
            setCachedConsoleWhere: jest.fn(),
            clearConsoleWhereCache: jest.fn(),
            getCachedProject: jest.fn(),
        } as any;

        mockDeps = {
            commandManager: mockCommandManager,
            cacheManager: mockCacheManager,
        };

        mockSelectOrganization = jest.fn().mockResolvedValue(true);
        mockDoSelectProject = jest.fn().mockResolvedValue(true);
    });

    describe('extractContextId', () => {
        it('should extract ID from object with id field', () => {
            const value = { id: '4566206088345546084', name: 'Test Project' };
            expect(extractContextId(value)).toBe('4566206088345546084');
        });

        it('should return string value as-is (name from CLI)', () => {
            const value = 'Headless Citisignal';
            expect(extractContextId(value)).toBe('Headless Citisignal');
        });

        it('should return undefined for undefined input', () => {
            expect(extractContextId(undefined)).toBeUndefined();
        });
    });

    describe('ensureContext - project comparison with cache resolution', () => {
        const expectedProjectId = '4566206088345546084';
        const projectName = 'Headless Citisignal';

        it('should NOT re-select when context has project object with matching ID', async () => {
            // Given: CLI returns full project object with ID
            const context: AdobeConsoleWhereResponse = {
                project: {
                    id: expectedProjectId,
                    name: projectName,
                },
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(context);

            const expected: ExpectedContext = {
                projectId: expectedProjectId,
            };

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should succeed without re-selection
            expect(result).toBe(true);
            expect(mockDoSelectProject).not.toHaveBeenCalled();
        });

        it('should resolve project name to ID using cache and NOT re-select when match', async () => {
            // Given: CLI returns just project name (string)
            const context: AdobeConsoleWhereResponse = {
                project: projectName, // String, not object!
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(context);

            // AND: Cache has the project with ID
            mockCacheManager.getCachedProject.mockReturnValue({
                id: expectedProjectId,
                name: projectName,
            } as any);

            const expected: ExpectedContext = {
                projectId: expectedProjectId,
            };

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should succeed without re-selection (cache resolved name to ID)
            expect(result).toBe(true);
            expect(mockCacheManager.getCachedProject).toHaveBeenCalled();
            expect(mockDoSelectProject).not.toHaveBeenCalled();
        });

        it('should re-select when context has string and cache has different project ID', async () => {
            // Given: CLI returns project name
            const context: AdobeConsoleWhereResponse = {
                project: projectName,
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(context);

            // AND: Cache has a DIFFERENT project
            mockCacheManager.getCachedProject.mockReturnValue({
                id: 'different-project-id',
                name: 'Different Project',
            } as any);

            const expected: ExpectedContext = {
                projectId: expectedProjectId,
            };

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should re-select (IDs don't match)
            expect(result).toBe(true);
            expect(mockCacheManager.getCachedProject).toHaveBeenCalled();
            expect(mockDoSelectProject).toHaveBeenCalledWith(expectedProjectId);
        });

        it('should re-select when context has string but cache is empty (safety fallback)', async () => {
            // Given: CLI returns project name
            const context: AdobeConsoleWhereResponse = {
                project: projectName,
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(context);

            // AND: Cache has NO project (e.g., fresh extension start)
            mockCacheManager.getCachedProject.mockReturnValue(undefined);

            const expected: ExpectedContext = {
                projectId: expectedProjectId,
            };

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should re-select as safety measure (can't verify)
            expect(result).toBe(true);
            expect(mockCacheManager.getCachedProject).toHaveBeenCalled();
            expect(mockDoSelectProject).toHaveBeenCalledWith(expectedProjectId);
        });

        it('should re-select when context has object with non-matching ID', async () => {
            // Given: CLI returns full object but with DIFFERENT ID
            const context: AdobeConsoleWhereResponse = {
                project: {
                    id: 'different-project-id',
                    name: 'Different Project',
                },
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(context);

            const expected: ExpectedContext = {
                projectId: expectedProjectId,
            };

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should re-select (ID mismatch)
            expect(result).toBe(true);
            expect(mockDoSelectProject).toHaveBeenCalledWith(expectedProjectId);
        });

        it('should handle re-selection failure gracefully', async () => {
            // Given: CLI returns wrong project
            const context: AdobeConsoleWhereResponse = {
                project: {
                    id: 'wrong-id',
                    name: 'Wrong Project',
                },
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(context);

            // AND: Re-selection will fail
            mockDoSelectProject.mockResolvedValue(false);

            const expected: ExpectedContext = {
                projectId: expectedProjectId,
            };

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should return false
            expect(result).toBe(false);
            expect(mockDoSelectProject).toHaveBeenCalled();
        });
    });

    describe('ensureContext - organization comparison', () => {
        const expectedOrgId = '12345@AdobeOrg';
        const orgName = 'My Organization';

        it('should NOT re-select when org ID matches', async () => {
            // Given: CLI returns org with matching ID
            const context: AdobeConsoleWhereResponse = {
                org: {
                    id: expectedOrgId,
                    name: orgName,
                    code: 'MYORG',
                },
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(context);

            const expected: ExpectedContext = {
                orgId: expectedOrgId,
            };

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should succeed without re-selection
            expect(result).toBe(true);
            expect(mockSelectOrganization).not.toHaveBeenCalled();
        });

        it('should re-select when org ID does not match', async () => {
            // Given: CLI returns different org
            const context: AdobeConsoleWhereResponse = {
                org: {
                    id: 'different-org-id',
                    name: 'Different Org',
                    code: 'DIFFORG',
                },
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(context);

            const expected: ExpectedContext = {
                orgId: expectedOrgId,
            };

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should re-select org
            expect(result).toBe(true);
            expect(mockSelectOrganization).toHaveBeenCalledWith(expectedOrgId);
        });
    });

    describe('ensureContext - no context needed', () => {
        it('should succeed when no expected context provided', async () => {
            // Given: No expected context
            const expected: ExpectedContext = {};
            
            // Mock console.where call (even though we don't use the result)
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: '{}',
                stderr: '',
            });

            // When: ensuring context
            const result = await ensureContext(mockDeps, expected, mockSelectOrganization, mockDoSelectProject);

            // Then: should succeed without any selection
            expect(result).toBe(true);
            expect(mockSelectOrganization).not.toHaveBeenCalled();
            expect(mockDoSelectProject).not.toHaveBeenCalled();
        });
    });
});
