/**
 * AdobeContextResolver Unit Tests
 *
 * Tests context resolution from Adobe CLI (console.where).
 * These tests verify the resolver works correctly in isolation.
 */

import { AdobeContextResolver } from '@/features/authentication/services/adobeContextResolver';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';

// Mock external dependencies
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging/debugLogger';
import { getMeshNodeVersion } from '@/core/utils/meshConfig';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { parseJSON } from '@/types/typeGuards';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

describe('AdobeContextResolver', () => {
    let resolver: AdobeContextResolver;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockFetcher: jest.Mocked<AdobeEntityFetcher>;

    beforeEach(() => {
        // Setup logger mock
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());

        // Mock parseJSON
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        // Create mocks
        mockCommandExecutor = createMockCommandExecutor({ execute: jest.fn() });

        mockCacheManager = {
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
            setCachedOrganization: jest.fn(),
            getCachedProject: jest.fn().mockReturnValue(undefined),
            setCachedProject: jest.fn(),
            getCachedWorkspace: jest.fn().mockReturnValue(undefined),
            setCachedWorkspace: jest.fn(),
            getCachedConsoleWhere: jest.fn().mockReturnValue(undefined),
            setCachedConsoleWhere: jest.fn(),
            getCachedOrgList: jest.fn().mockReturnValue(undefined),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockFetcher = {
            getOrganizations: jest.fn(),
            getProjects: jest.fn(),
            getWorkspaces: jest.fn(),
        } as unknown as jest.Mocked<AdobeEntityFetcher>;

        resolver = new AdobeContextResolver(mockCommandExecutor, mockCacheManager, mockFetcher);
    });

    describe('getConsoleWhereContext()', () => {
        it('should return cached context if available', async () => {
            const cachedContext = {
                org: { id: 'org1', name: 'Test Org', code: 'ORG1' },
                project: { id: 'proj1', name: 'Test Project' },
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(cachedContext);

            const result = await resolver.getConsoleWhereContext();

            expect(result).toEqual(cachedContext);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should fetch context from CLI when not cached', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({
                    org: { id: 'org1', name: 'CLI Org', code: 'ORG@AdobeOrg' },
                    project: { id: 'proj1', name: 'CLI Project' },
                }),
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await resolver.getConsoleWhereContext();

            expect(result).toBeDefined();
            expect(result?.org).toBeDefined();
            expect(mockCacheManager.setCachedConsoleWhere).toHaveBeenCalled();
        });

        it('should return undefined on CLI failure', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
                duration: 0,
            });

            const result = await resolver.getConsoleWhereContext();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentOrganization()', () => {
        it('should return cached organization if available', async () => {
            const cachedOrg = { id: 'org1', code: 'ORG@AdobeOrg', name: 'Cached Org' };
            mockCacheManager.getCachedOrganization.mockReturnValue(cachedOrg);

            const result = await resolver.getCurrentOrganization();

            expect(result).toEqual(cachedOrg);
        });

        it('should resolve org from context when org is object', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', code: 'ORG@AdobeOrg', name: 'Context Org' },
            });

            const result = await resolver.getCurrentOrganization();

            expect(result).toBeDefined();
            expect(result?.name).toBe('Context Org');
            expect(mockCacheManager.setCachedOrganization).toHaveBeenCalled();
        });

        it('should resolve org ID via fetcher when org is string', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: 'Organization Name',
            });
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Organization Name' },
            ]);

            const result = await resolver.getCurrentOrganization();

            expect(result).toBeDefined();
            expect(result?.id).toBe('org1');
            expect(mockFetcher.getOrganizations).toHaveBeenCalled();
        });

        it('should use cached org list for resolution when available', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: 'Organization Name',
            });
            mockCacheManager.getCachedOrgList.mockReturnValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Organization Name' },
            ]);

            const result = await resolver.getCurrentOrganization();

            expect(result).toBeDefined();
            expect(result?.id).toBe('org1');
            expect(mockFetcher.getOrganizations).not.toHaveBeenCalled();
        });

        it('should return undefined when no org selected', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({});

            const result = await resolver.getCurrentOrganization();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentProject()', () => {
        it('should return cached project if available', async () => {
            const cachedProject = { id: 'proj1', name: 'Cached Project', title: 'Cached Project' };
            mockCacheManager.getCachedProject.mockReturnValue(cachedProject);

            const result = await resolver.getCurrentProject();

            expect(result).toEqual(cachedProject);
        });

        it('should resolve project from context when project is object', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: { id: 'proj1', name: 'Context Project', title: 'Context Project Title' },
            });

            const result = await resolver.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.name).toBe('Context Project');
            expect(mockCacheManager.setCachedProject).toHaveBeenCalled();
        });

        it('should resolve project ID via fetcher when project is string', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: 'Project Name',
            });
            mockFetcher.getProjects.mockResolvedValue([
                { id: 'proj1', name: 'Project Name', title: 'Project Name' },
            ]);

            const result = await resolver.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.id).toBe('proj1');
            // No org threaded here: getProjects resolves the org itself (threaded → cached →
            // TOKEN org via the SDK), so this best-effort lookup stays on the SDK path.
            expect(mockFetcher.getProjects).toHaveBeenCalledWith({ silent: true });
        });

        // REGRESSION: this used to fabricate `{ id: name, name, title }` when the
        // lookup missed — an AdobeProject whose ID is a NAME. `aio console where`
        // holds a selection the extension no longer writes (Phase 4a targets per-op
        // instead), so it goes stale by design: a deleted project, or one belonging
        // to an org this token cannot reach, lands here on every resolve. Returning
        // a name-shaped ID is worse than returning nothing — it satisfies `.id`
        // presence checks and would target nothing at all if it ever reached
        // AIO_CONSOLE_PROJECT_ID. Fail closed.
        it('returns undefined when the CLI-persisted project is not in the list', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: 'Kukla Mesh Test',
            });
            mockFetcher.getProjects.mockResolvedValue([
                { id: 'proj1', name: 'Kukla Mesh', title: 'Kukla Mesh' },
            ]);

            const result = await resolver.getCurrentProject();

            expect(result).toBeUndefined();
            // Nothing worth caching, and caching it would make the miss sticky.
            expect(mockCacheManager.setCachedProject).not.toHaveBeenCalled();
        });

        it('returns undefined when the project list cannot be fetched', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: 'Some Project',
            });
            mockFetcher.getProjects.mockRejectedValue(new Error('network'));

            const result = await resolver.getCurrentProject();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentWorkspace()', () => {
        it('should return cached workspace if available', async () => {
            const cachedWorkspace = {
                id: 'ws1',
                name: 'Cached Workspace',
                title: 'Cached Workspace',
            };
            mockCacheManager.getCachedWorkspace.mockReturnValue(cachedWorkspace);

            const result = await resolver.getCurrentWorkspace();

            expect(result).toEqual(cachedWorkspace);
        });

        it('should resolve workspace from context when workspace is object', async () => {
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: { id: 'ws1', name: 'Production', title: 'Production' },
            });

            const result = await resolver.getCurrentWorkspace();

            expect(result).toBeDefined();
            expect(result?.name).toBe('Production');
            expect(mockCacheManager.setCachedWorkspace).toHaveBeenCalled();
        });

        it('should return undefined when workspace is string (not supported)', async () => {
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: 'Production',
            });

            const result = await resolver.getCurrentWorkspace();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentContext()', () => {
        it('should aggregate org, project, and workspace', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: 'org1',
                code: 'ORG',
                name: 'Org',
            });
            mockCacheManager.getCachedProject.mockReturnValue({
                id: 'proj1',
                name: 'Project',
                title: 'Project',
            });
            mockCacheManager.getCachedWorkspace.mockReturnValue({
                id: 'ws1',
                name: 'Workspace',
                title: 'Workspace',
            });

            const result = await resolver.getCurrentContext();

            expect(result.org).toBeDefined();
            expect(result.project).toBeDefined();
            expect(result.workspace).toBeDefined();
        });

        it('should handle partial context', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: 'org1',
                code: 'ORG',
                name: 'Org',
            });
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({});

            const result = await resolver.getCurrentContext();

            expect(result.org).toBeDefined();
            expect(result.project).toBeUndefined();
            expect(result.workspace).toBeUndefined();
        });
    });
    describe('getConsoleWhereContext() — the CLI call and what counts as an answer', () => {
        const cliAnswer = (code: number, stdout: string) => ({ stdout, stderr: '', code, duration: 0 });

        it('runs console where as JSON, under the mesh node version, with the NORMAL timeout', async () => {
            mockCommandExecutor.execute.mockResolvedValue(cliAnswer(0, '{}'));

            await resolver.getConsoleWhereContext();

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith('aio console where --json', {
                encoding: 'utf8',
                timeout: TIMEOUTS.NORMAL,
                useNodeVersion: getMeshNodeVersion(),
            });
        });

        it.each([
            ['a non-zero exit with output', cliAnswer(1, '{"org":"Org"}')],
            ['a zero exit with no output', cliAnswer(0, '')],
        ])('%s is no context and caches nothing', async (_what, answer) => {
            mockCommandExecutor.execute.mockResolvedValue(answer);

            await expect(resolver.getConsoleWhereContext()).resolves.toBeUndefined();
            expect(mockCacheManager.setCachedConsoleWhere).not.toHaveBeenCalled();
        });

        it('output that is not JSON is no context and caches nothing', async () => {
            mockCommandExecutor.execute.mockResolvedValue(cliAnswer(0, 'not json'));

            await expect(resolver.getConsoleWhereContext()).resolves.toBeUndefined();
            expect(mockCacheManager.setCachedConsoleWhere).not.toHaveBeenCalled();
        });

        it('caches exactly what the CLI answered', async () => {
            const answered = { org: { id: 'org1', name: 'CLI Org', code: 'ORG@AdobeOrg' } };
            mockCommandExecutor.execute.mockResolvedValue(cliAnswer(0, JSON.stringify(answered)));

            await expect(resolver.getConsoleWhereContext()).resolves.toEqual(answered);
            expect(mockCacheManager.setCachedConsoleWhere).toHaveBeenCalledWith(answered);
        });
    });

    describe('getCurrentOrganization() — resolving a string org against the list', () => {
        const ORG1 = { id: 'Org1', code: 'ORG@AdobeOrg', name: 'Organization Name' };
        const ORG2 = { id: 'Org2', code: 'OTHER@AdobeOrg', name: 'Other Org' };

        beforeEach(() => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
        });

        it.each([
            ['its name, ignoring case and padding', '  organization NAME  '],
            ['its code, ignoring case', 'org@adobeorg'],
            ['its id, ignoring case', 'org1'],
        ])('matches an org by %s', async (_how, consoleOrg) => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: consoleOrg });
            mockCacheManager.getCachedOrgList.mockReturnValue([ORG2, ORG1]);

            await expect(resolver.getCurrentOrganization()).resolves.toEqual(ORG1);
            expect(mockCacheManager.setCachedOrganization).toHaveBeenCalledWith(ORG1);
        });

        it.each([
            ['name', 'organization name'],
            ['code', 'org@adobeorg'],
            ['id', 'org1'],
        ])('padding on the LIST side never decides a %s match either', async (_field, consoleOrg) => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: consoleOrg });
            const padded = { id: ' Org1 ', code: ' ORG@AdobeOrg ', name: '  Organization Name ' };
            mockCacheManager.getCachedOrgList.mockReturnValue([ORG2, padded]);

            await expect(resolver.getCurrentOrganization()).resolves.toEqual(padded);
        });

        it('an EMPTY cached list is a miss: the list is fetched', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: 'Organization Name' });
            mockCacheManager.getCachedOrgList.mockReturnValue([]);
            mockFetcher.getOrganizations.mockResolvedValue([ORG1]);

            await expect(resolver.getCurrentOrganization()).resolves.toEqual(ORG1);
            expect(mockFetcher.getOrganizations).toHaveBeenCalledTimes(1);
        });

        it('an org in neither list nor fetch falls back to a name-shaped org, and caches it', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: 'Unknown Org' });
            mockFetcher.getOrganizations.mockResolvedValue([ORG1]);

            const fallback = { id: 'Unknown Org', code: 'Unknown Org', name: 'Unknown Org' };
            await expect(resolver.getCurrentOrganization()).resolves.toEqual(fallback);
            expect(mockCacheManager.setCachedOrganization).toHaveBeenCalledWith(fallback);
        });

        it('a list fetch that fails is an empty list: the name-shaped fallback, not nothing', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: 'Organization Name' });
            mockFetcher.getOrganizations.mockRejectedValue(new Error('network'));

            await expect(resolver.getCurrentOrganization()).resolves.toEqual({
                id: 'Organization Name',
                code: 'Organization Name',
                name: 'Organization Name',
            });
        });

        it('a whitespace-only org is no org: nothing is resolved or cached', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: '   ' });

            await expect(resolver.getCurrentOrganization()).resolves.toBeUndefined();
            expect(mockFetcher.getOrganizations).not.toHaveBeenCalled();
            expect(mockCacheManager.setCachedOrganization).not.toHaveBeenCalled();
        });
    });

    describe('getCurrentOrganization() — an object org is taken field by field', () => {
        beforeEach(() => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
        });

        it('keeps id, code and name when all three are present', async () => {
            const org = { id: 'org1', code: 'ORG@AdobeOrg', name: 'Context Org' };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org });

            await expect(resolver.getCurrentOrganization()).resolves.toEqual(org);
        });

        it('fills a missing id and code from the name', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: '', code: '', name: 'Named Only' },
            });

            await expect(resolver.getCurrentOrganization()).resolves.toEqual({
                id: 'Named Only',
                code: 'Named Only',
                name: 'Named Only',
            });
        });

        it('fills a missing name and code from the id', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', code: '', name: '' },
            });

            await expect(resolver.getCurrentOrganization()).resolves.toEqual({
                id: 'org1',
                code: 'org1',
                name: 'org1',
            });
        });
    });

    describe('getCurrentProject() — matching and shaping', () => {
        beforeEach(() => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
        });

        it.each([
            ['name', 'Kukla Mesh'],
            ['title', 'KM'],
        ])('a string project matches the list by %s alone', async (_by, consoleProject) => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ project: consoleProject });
            const listed = { id: 'proj1', name: 'Kukla Mesh', title: 'KM' };
            mockFetcher.getProjects.mockResolvedValue([{ id: 'proj0', name: 'Other', title: 'Other' }, listed]);

            await expect(resolver.getCurrentProject()).resolves.toEqual(listed);
            expect(mockCacheManager.setCachedProject).toHaveBeenCalledWith(listed);
        });

        it('an object project keeps its own title', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: { id: 'proj1', name: 'Context Project', title: 'A Title', description: 'd', org_id: 'org1' },
            });

            await expect(resolver.getCurrentProject()).resolves.toEqual({
                id: 'proj1',
                name: 'Context Project',
                title: 'A Title',
                description: 'd',
                org_id: 'org1',
            });
        });

        it('an object project without a title is titled by its name', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: { id: 'proj1', name: 'Context Project' },
            });

            await expect(resolver.getCurrentProject()).resolves.toEqual({
                id: 'proj1',
                name: 'Context Project',
                title: 'Context Project',
                description: undefined,
                org_id: undefined,
            });
        });
    });

    describe('getCurrentWorkspace() — shaping', () => {
        beforeEach(() => {
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
        });

        it('keeps the workspace title when it differs from the name', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: { id: 'ws1', name: 'Stage', title: 'Staging' },
            });

            const shaped = { id: 'ws1', name: 'Stage', title: 'Staging' };
            await expect(resolver.getCurrentWorkspace()).resolves.toEqual(shaped);
            expect(mockCacheManager.setCachedWorkspace).toHaveBeenCalledWith(shaped);
        });

        it('titles a workspace without a title by its name', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: { id: 'ws1', name: 'Stage' },
            });

            await expect(resolver.getCurrentWorkspace()).resolves.toEqual({
                id: 'ws1',
                name: 'Stage',
                title: 'Stage',
            });
        });

        it('no console context at all is no workspace, and caches nothing', async () => {
            mockCommandExecutor.execute.mockResolvedValue({ stdout: '', stderr: '', code: 1, duration: 0 });

            await expect(resolver.getCurrentWorkspace()).resolves.toBeUndefined();
            expect(mockCacheManager.setCachedWorkspace).not.toHaveBeenCalled();
        });
    });
});
