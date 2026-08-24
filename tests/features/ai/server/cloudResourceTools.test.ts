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
const mockListOrgSites = jest.fn();
const mockDeleteAllSiteContent = jest.fn();

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: mockInspectToken }),
        })),
    },
}));
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations', () => ({
    DaLiveOrgOperations: jest.fn(() => ({ listOrgSites: mockListOrgSites })),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(() => ({ deleteAllSiteContent: mockDeleteAllSiteContent })),
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { registerCloudResourceTools } from '@/features/ai/server/cloudResourceTools';
import { runWithAdobeTarget } from '@/features/ai/server/adobeTargetStore';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { ErrorCode } from '@/types/errorCodes';
import { AuthError } from '@/types/errors';
import type { HandlerContext } from '@/types/handlers';
import { expectWithinCeiling } from './responseCeilings';

const getGitHubServicesMock = getGitHubServices as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockInspectToken.mockResolvedValue({ valid: true, expiresIn: 60, token: 'ims-token' });
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
    createFromTemplate?: jest.Mock;
    waitForContent?: jest.Mock;
} = {}) {
    const validateToken = overrides.validateThrows
        ? jest.fn(async () => { throw new Error('network'); })
        : jest.fn(async () => ({ valid: overrides.valid ?? true }));
    return {
        tokenService: { validateToken },
        repoOperations: {
            listUserRepositories: jest.fn(async () => overrides.repos ?? []),
            deleteRepository: overrides.deleteRepository ?? jest.fn(async () => undefined),
            // Shape from GitHubRepo (`types.ts:47-66`): fullName/htmlUrl/defaultBranch,
            // and NO `owner` field — the tool derives the owner from fullName.
            createFromTemplate:
                overrides.createFromTemplate ??
                jest.fn(async () => ({
                    id: 1,
                    name: 'my-site',
                    fullName: 'acme/my-site',
                    htmlUrl: 'https://github.com/acme/my-site',
                    cloneUrl: 'https://github.com/acme/my-site.git',
                    defaultBranch: 'main',
                    isPrivate: false,
                })),
            waitForContent: overrides.waitForContent ?? jest.fn(async () => true),
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


    describe('create_github_repo', () => {
        const ARGS = { templateOwner: 'adobe', templateRepo: 'boilerplate', name: 'my-site' };

        function serve(overrides = {}) {
            getGitHubServicesMock.mockReturnValue(gh(overrides));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            return s;
        }

        it('hands off to GitHub auth when not signed in', async () => {
            expect(await serve({ valid: false }).call('create_github_repo', ARGS)).toMatchObject({
                needsAuth: 'github',
            });
        });

        it('refuses without the template and name', async () => {
            expect(await serve().call('create_github_repo', { name: 'x' })).toMatchObject({
                error: expect.stringMatching(/templateOwner, templateRepo and name are required/),
            });
        });

        it('returns the repo, its URL and the default branch', async () => {
            expect(await serve().call('create_github_repo', ARGS)).toEqual({
                created: true,
                repo: 'acme/my-site',
                url: 'https://github.com/acme/my-site',
                defaultBranch: 'main',
                isPrivate: false,
                contentReady: true,
            });
        });

        // A repo EXISTS before its template content does, and the next step is
        // always a push or publish against exactly those files.
        it('waits for content by default', async () => {
            const waitForContent = jest.fn(async () => true);
            await serve({ waitForContent }).call('create_github_repo', ARGS);
            // Owner comes from fullName — GitHubRepo carries no `owner` field, and
            // targetOwner is absent whenever the repo went to the personal account.
            expect(waitForContent).toHaveBeenCalledWith('acme', 'my-site');
        });

        it('skips the wait when asked, and omits the flag entirely', async () => {
            const waitForContent = jest.fn(async () => true);
            const res = await serve({ waitForContent }).call('create_github_repo', {
                ...ARGS,
                waitForContent: false,
            });
            expect(waitForContent).not.toHaveBeenCalled();
            expect('contentReady' in res).toBe(false);
        });

        // The repo is real even when the wait times out. Reporting created:false
        // would invite a retry that collides on the name.
        it('still reports the repo when content never becomes ready', async () => {
            const res = await serve({ waitForContent: jest.fn(async () => false) }).call(
                'create_github_repo',
                ARGS,
            );
            expect(res.created).toBe(true);
            expect(res.contentReady).toBe(false);
            expect(res.note).toMatch(/not readable yet/);
        });

        it('survives waitForContent throwing', async () => {
            const res = await serve({
                waitForContent: jest.fn(async () => {
                    throw new Error('rate limited');
                }),
            }).call('create_github_repo', ARGS);
            expect(res).toMatchObject({ created: true, contentReady: false });
        });

        it('passes the target namespace and privacy through', async () => {
            const createFromTemplate = jest.fn(async () => ({
                id: 2, name: 'my-site', fullName: 'my-org/my-site',
                htmlUrl: 'u', cloneUrl: 'c', defaultBranch: 'main', isPrivate: true,
            }));
            await serve({ createFromTemplate }).call('create_github_repo', {
                ...ARGS,
                targetOwner: 'my-org',
                isPrivate: true,
            });
            expect(createFromTemplate).toHaveBeenCalledWith(
                'adobe', 'boilerplate', 'my-site', true, 'my-org',
            );
        });

        it('reports a creation failure without claiming the repo exists', async () => {
            const res = await serve({
                createFromTemplate: jest.fn(async () => {
                    throw new Error('name already exists');
                }),
            }).call('create_github_repo', ARGS);
            expect(res).toEqual({ created: false, error: 'name already exists' });
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

        it('maps an ORG_MISMATCH error to a typed non-retryable result', async () => {
            mockListOrgSites.mockRejectedValueOnce(new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org'));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            expect(await s.call('list_dalive_sites', { org: 'acme' })).toMatchObject({
                error_type: 'ORG_MISMATCH',
                non_retryable: true,
            });
        });

        it('runs the DA.live listing under the stored session org context', async () => {
            mockListOrgSites.mockResolvedValueOnce([]);
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            await s.call('list_dalive_sites', { org: 'acme' });
            expect(runWithAdobeTarget).toHaveBeenCalled();
        });
    });

    describe('cleanup_dalive_site', () => {
        it('requires org and site', async () => {
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            expect(await s.call('cleanup_dalive_site', { org: 'acme', site: '' })).toMatchObject({
                error: expect.stringMatching(/org and site are required/),
            });
        });

        it('refuses without confirm + confirmName echo (irreversible) and never calls the service', async () => {
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_site', { org: 'acme', site: 'shop' });
            expect(res).toMatchObject({ irreversible: true });
            expect(res.error).toMatch(/confirmName:"acme\/shop"/);
            expect(mockDeleteAllSiteContent).not.toHaveBeenCalled();
        });

        it('refuses when confirmName does not echo org/site exactly', async () => {
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_site', { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/WRONG' });
            expect(res).toMatchObject({ irreversible: true });
            expect(mockDeleteAllSiteContent).not.toHaveBeenCalled();
        });

        it('hands off to Adobe auth when the strict gate passes but token invalid', async () => {
            mockInspectToken.mockResolvedValueOnce({ valid: false, expiresIn: 0 });
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_site', { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/shop' });
            expect(res).toMatchObject({ needsAuth: 'adobe' });
            expect(mockDeleteAllSiteContent).not.toHaveBeenCalled();
        });

        it('deletes site content when confirm + confirmName echo exactly', async () => {
            mockDeleteAllSiteContent.mockResolvedValueOnce({ success: true, deletedCount: 7 });
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_site', { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/shop' });
            expect(res).toEqual({ deleted: true, site: 'acme/shop', deletedCount: 7 });
            expect(mockDeleteAllSiteContent).toHaveBeenCalledWith('acme', 'shop');
        });

        it('maps an ORG_MISMATCH error to a typed non-retryable result', async () => {
            mockDeleteAllSiteContent.mockRejectedValueOnce(new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org'));
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            const res = await s.call('cleanup_dalive_site', { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/shop' });
            expect(res).toMatchObject({ error_type: 'ORG_MISMATCH', non_retryable: true });
        });

        it('runs the DA.live cleanup under the stored session org context', async () => {
            mockDeleteAllSiteContent.mockResolvedValueOnce({ success: true, deletedCount: 0 });
            const s = fakeServer();
            registerCloudResourceTools(s, ctxFactory);
            await s.call('cleanup_dalive_site', { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/shop' });
            expect(runWithAdobeTarget).toHaveBeenCalled();
        });
    });
});

// ─── response-size ceilings (phase 2 audit) ──────────────────────────────────
//
// Driven with an oversized payload: 400 repos, 400 sites. Both tools page, and
// the ceiling is what proves the paging is doing the work rather than the
// fixture being small.
describe('response-size ceilings', () => {
    it('list_github_repos — 400 repos', async () => {
        const s = fakeServer();
        getGitHubServicesMock.mockReturnValue({
            tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
            repoOperations: {
                listUserRepositories: jest.fn(async () =>
                    Array.from({ length: 400 }, (_, i) => ({
                        fullName: `owner-name/repository-number-${i}`,
                        isPrivate: false,
                        updatedAt: '2026-08-16T18:05:45Z',
                    })),
                ),
            },
        });
        registerCloudResourceTools(s, ctxFactory);

        expectWithinCeiling('list_github_repos', JSON.stringify(await s.call('list_github_repos', {})));
    });

    it.each([
        ['delete_github_repo', {}],
        ['cleanup_dalive_site', {}],
    ])('%s — its refusal stays tiny', async (tool, args) => {
        const s = fakeServer();
        registerCloudResourceTools(s, ctxFactory);
        expectWithinCeiling(tool, JSON.stringify(await s.call(tool, args)));
    });
});
