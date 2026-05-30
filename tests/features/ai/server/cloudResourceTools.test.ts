/**
 * cloud-resource tools — GitHub repo list/delete adapters. The EDS service layer
 * is mocked (no real GitHub calls); covers auth handoff, pagination/projection,
 * and the extra-strict (confirm + confirmName echo) gate on the irreversible
 * delete.
 */

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
}));

const mockInspectToken = jest.fn();
const mockGetAccessToken = jest.fn();
const mockListOrgSites = jest.fn();
const mockDeleteAllSiteContent = jest.fn();

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: mockInspectToken, getAccessToken: mockGetAccessToken }),
        })),
    },
}));
jest.mock('@/features/eds/services/daLiveOrgOperations', () => ({
    DaLiveOrgOperations: jest.fn(() => ({ listOrgSites: mockListOrgSites })),
}));
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(() => ({ deleteAllSiteContent: mockDeleteAllSiteContent })),
}));

import { registerCloudResourceTools } from '@/features/ai/server/cloudResourceTools';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import type { HandlerContext } from '@/types/handlers';

const getGitHubServicesMock = getGitHubServices as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockInspectToken.mockResolvedValue({ valid: true, expiresIn: 60 });
    mockGetAccessToken.mockResolvedValue('ims-token');
    mockListOrgSites.mockResolvedValue([]);
    mockDeleteAllSiteContent.mockResolvedValue({ success: true, deletedCount: 0 });
});

function fakeServer() {

    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {

        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },

        async call(name: string, args?: unknown): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

const ctxFactory = () => ({}) as unknown as HandlerContext;

/** Build a GitHub services double; override pieces per test. */
function gh(overrides: {
    valid?: boolean;
    validateThrows?: boolean;
    repos?: Array<{ fullName: string; isPrivate: boolean; updatedAt: string }>;
    deleteRepository?: jest.Mock;
} = {}) {
    const validateToken = overrides.validateThrows
        ? jest.fn(async () => { throw new Error('network'); })
        : jest.fn(async () => ({ valid: overrides.valid ?? true }));
    return {
        tokenService: { validateToken },
        repoOperations: {
            listUserRepositories: jest.fn(async () => overrides.repos ?? []),
            deleteRepository: overrides.deleteRepository ?? jest.fn(async () => undefined),
        },
    };
}

describe('cloud-resource tools (GitHub)', () => {
    describe('list_github_repos', () => {
        it('hands off to GitHub auth when not signed in', async () => {
            getGitHubServicesMock.mockReturnValue(gh({ valid: false }));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            expect(await s.call('list_github_repos', {})).toMatchObject({ needsAuth: 'github' });
        });

        it('treats a token-validation throw as unauthenticated', async () => {
            getGitHubServicesMock.mockReturnValue(gh({ validateThrows: true }));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            expect(await s.call('list_github_repos', {})).toMatchObject({ needsAuth: 'github' });
        });

        it('returns a paginated, summary-projected page (no raw API fields)', async () => {
            const repos = Array.from({ length: 5 }, (_, i) => ({
                fullName: `me/repo-${i}`,
                isPrivate: i % 2 === 0,
                updatedAt: `2026-01-0${i + 1}`,
                htmlUrl: 'should-not-appear',
            }));
            getGitHubServicesMock.mockReturnValue(gh({ repos }));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);

            const res = await s.call('list_github_repos', { offset: 1, limit: 2 });
            expect(res).toEqual({
                total: 5,
                offset: 1,
                limit: 2,
                repos: [
                    { fullName: 'me/repo-1', isPrivate: false, updatedAt: '2026-01-02' },
                    { fullName: 'me/repo-2', isPrivate: true, updatedAt: '2026-01-03' },
                ],
            });
        });
    });

    describe('delete_github_repo', () => {
        it('requires owner and repo', async () => {
            getGitHubServicesMock.mockReturnValue(gh());
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            expect(await s.call('delete_github_repo', { owner: '', repo: '' })).toMatchObject({
                error: expect.stringMatching(/owner and repo are required/),
            });
        });

        it('refuses without confirm:true (irreversible) and never calls the service', async () => {
            const deleteRepository = jest.fn(async () => undefined);
            getGitHubServicesMock.mockReturnValue(gh({ deleteRepository }));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);

            const res = await s.call('delete_github_repo', { owner: 'me', repo: 'r' });
            expect(res).toMatchObject({ irreversible: true });
            expect(res.error).toMatch(/confirmName:"me\/r"/);
            expect(deleteRepository).not.toHaveBeenCalled();
        });

        it('refuses when confirmName does not echo owner/repo exactly', async () => {
            const deleteRepository = jest.fn(async () => undefined);
            getGitHubServicesMock.mockReturnValue(gh({ deleteRepository }));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);

            const res = await s.call('delete_github_repo', { owner: 'me', repo: 'r', confirm: true, confirmName: 'me/WRONG' });
            expect(res).toMatchObject({ irreversible: true });
            expect(deleteRepository).not.toHaveBeenCalled();
        });

        it('hands off to GitHub auth when the strict gate passes but not signed in', async () => {
            const deleteRepository = jest.fn(async () => undefined);
            getGitHubServicesMock.mockReturnValue(gh({ valid: false, deleteRepository }));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);

            const res = await s.call('delete_github_repo', { owner: 'me', repo: 'r', confirm: true, confirmName: 'me/r' });
            expect(res).toMatchObject({ needsAuth: 'github' });
            expect(deleteRepository).not.toHaveBeenCalled();
        });

        it('deletes when confirm:true and confirmName echoes exactly', async () => {
            const deleteRepository = jest.fn(async () => undefined);
            getGitHubServicesMock.mockReturnValue(gh({ deleteRepository }));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);

            const res = await s.call('delete_github_repo', { owner: 'me', repo: 'r', confirm: true, confirmName: 'me/r' });
            expect(res).toEqual({ deleted: true, repo: 'me/r' });
            expect(deleteRepository).toHaveBeenCalledWith('me', 'r');
        });

        it('returns deleted:false with the error when the service throws', async () => {
            const deleteRepository = jest.fn(async () => { throw new Error('insufficient scope'); });
            getGitHubServicesMock.mockReturnValue(gh({ deleteRepository }));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);

            const res = await s.call('delete_github_repo', { owner: 'me', repo: 'r', confirm: true, confirmName: 'me/r' });
            expect(res).toMatchObject({ deleted: false, repo: 'me/r', error: 'insufficient scope' });
        });
    });
});

describe('cloud-resource tools (DA.live)', () => {
    describe('list_dalive_sites', () => {
        it('requires org', async () => {
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            expect(await s.call('list_dalive_sites', { org: '' })).toMatchObject({
                error: expect.stringMatching(/org is required/),
            });
        });

        it('hands off to Adobe auth when the IMS token is invalid', async () => {
            mockInspectToken.mockResolvedValueOnce({ valid: false, expiresIn: 0 });
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            expect(await s.call('list_dalive_sites', { org: 'acme' })).toMatchObject({ needsAuth: 'adobe' });
            expect(mockListOrgSites).not.toHaveBeenCalled();
        });

        it('returns a paginated, summary-projected page (drops path/ext)', async () => {
            mockListOrgSites.mockResolvedValueOnce([
                { name: 'a', path: '/a', lastModified: 1 },
                { name: 'b', path: '/b', ext: 'json', lastModified: 2 },
                { name: 'c', path: '/c', lastModified: 3 },
            ]);
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);

            const res = await s.call('list_dalive_sites', { org: 'acme', offset: 1, limit: 1 });
            expect(res).toEqual({
                org: 'acme',
                total: 3,
                offset: 1,
                limit: 1,
                sites: [{ name: 'b', lastModified: 2 }],
            });
        });
    });

    describe('cleanup_dalive_sites', () => {
        it('requires org and site', async () => {
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            expect(await s.call('cleanup_dalive_sites', { org: 'acme', site: '' })).toMatchObject({
                error: expect.stringMatching(/org and site are required/),
            });
        });

        it('refuses without confirm + confirmName echo (irreversible) and never calls the service', async () => {
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_sites', { org: 'acme', site: 'shop' });
            expect(res).toMatchObject({ irreversible: true });
            expect(res.error).toMatch(/confirmName:"acme\/shop"/);
            expect(mockDeleteAllSiteContent).not.toHaveBeenCalled();
        });

        it('refuses when confirmName does not echo org/site exactly', async () => {
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_sites', { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/WRONG' });
            expect(res).toMatchObject({ irreversible: true });
            expect(mockDeleteAllSiteContent).not.toHaveBeenCalled();
        });

        it('hands off to Adobe auth when the strict gate passes but token invalid', async () => {
            mockInspectToken.mockResolvedValueOnce({ valid: false, expiresIn: 0 });
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_sites', { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/shop' });
            expect(res).toMatchObject({ needsAuth: 'adobe' });
            expect(mockDeleteAllSiteContent).not.toHaveBeenCalled();
        });

        it('deletes site content when confirm + confirmName echo exactly', async () => {
            mockDeleteAllSiteContent.mockResolvedValueOnce({ success: true, deletedCount: 7 });
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_sites', { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/shop' });
            expect(res).toEqual({ deleted: true, site: 'acme/shop', deletedCount: 7 });
            expect(mockDeleteAllSiteContent).toHaveBeenCalledWith('acme', 'shop');
        });
    });
});
