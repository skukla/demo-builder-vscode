/**
 * checkDemoSource — is an added demo's source still there?
 *
 * The repository read, the rename that is followed in three places at once
 * (project row, instance metadata, remembered setting), and the content-index
 * probe. Every assertion is an argument handed to a collaborator or the
 * returned sentence.
 */

jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    renameAddedDemoSource: jest.fn(),
}));

import { COMPONENT_IDS } from '@/core/constants';
import { checkDemoSource } from '@/features/eds/services/reset/demoSourceCheck';
import type { GitHubRepoOperations } from '@/features/eds/services/github/githubRepoOperations';
import { renameAddedDemoSource } from '@/features/project-creation/services/addedDemoSettings';
import type { Project } from '@/types/base';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject, edsStorefrontInstance } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

const mockRename = renameAddedDemoSource as jest.MockedFunction<typeof renameAddedDemoSource>;

const REPO = { fullName: 'jen/isle5-demo', defaultBranch: 'main' };

function project(overrides: Partial<Project> = {}): Project {
    const eds = edsStorefrontInstance();
    return createMockProject({
        demo: makeAddedDemo({ contentSource: { org: 'jen', site: 'isle5-content', indexPath: '/full-index.json' } }),
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                ...eds,
                metadata: { ...eds.metadata, templateOwner: 'jen', templateRepo: 'isle5-demo' },
            },
        },
        ...overrides,
    });
}

function context() {
    return createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({ saveProject: jest.fn().mockResolvedValue(undefined) }),
    });
}

function repoOps(answer: Promise<unknown>): Pick<GitHubRepoOperations, 'getRepository'> {
    return { getRepository: jest.fn().mockReturnValue(answer) } as unknown as Pick<
        GitHubRepoOperations,
        'getRepository'
    >;
}

const okFetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })) as unknown as typeof fetch;
const goneFetch = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;

beforeEach(() => {
    jest.clearAllMocks();
    mockRename.mockResolvedValue(true);
});

describe('checkDemoSource', () => {
    it('is reachable when GitHub answers and the content index is published', async () => {
        const ops = repoOps(Promise.resolve(REPO));

        const check = await checkDemoSource(project(), ops, context(), okFetch);

        expect(ops.getRepository).toHaveBeenCalledWith('jen', 'isle5-demo');
        expect(okFetch).toHaveBeenCalledWith(
            'https://main--isle5-content--jen.aem.live/full-index.json',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(check).toEqual({ reachable: true, checked: true, message: '', contentReachable: true });
    });

    // The error `GitHubRepoOperations.getRepository` throws for a 404, its status riding along.
    const notFound = () => Object.assign(new Error('Repository not found'), { status: 404 });

    it("refuses in a sentence that names whose demo it is when GitHub says the repository is gone", async () => {
        const check = await checkDemoSource(project(), repoOps(Promise.reject(notFound())), context(), okFetch);

        expect(check).toEqual({
            reachable: false,
            checked: true,
            contentReachable: false,
            message: "The Isle5 by Jen demo's repository can't be reached. Reset and updates are unavailable until it is.",
        });
        expect(okFetch).not.toHaveBeenCalled();
    });

    // Owner, 2026-11-05: a dropped network one night showed JustRite's "can't be reached" notice,
    // gone the next morning. A read that failed says it could not check, and nothing more.
    it.each([
        ['a network failure', new Error('getaddrinfo ENOTFOUND api.github.com')],
        ['a sign-in GitHub refused', Object.assign(new Error('Bad credentials'), { status: 401 })],
        ['a GitHub outage', Object.assign(new Error('Server Error'), { status: 502 })],
    ])('says it could not check, not that the source is gone, on %s', async (_what, error) => {
        const check = await checkDemoSource(project(), repoOps(Promise.reject(error)), context(), okFetch);

        expect(check).toEqual({
            reachable: false,
            checked: false,
            contentReachable: false,
            message: "Couldn't check the Isle5 by Jen demo's repository. Try again in a moment.",
        });
    });

    it('follows a rename into the row, the instance metadata and the remembered setting, and saves', async () => {
        const p = project();
        const ctx = context();

        const check = await checkDemoSource(
            p,
            repoOps(Promise.resolve({ ...REPO, fullName: 'jen/isle5-2026' })),
            ctx,
            okFetch,
        );

        expect(check.renamedTo).toBe('jen/isle5-2026');
        expect(p.demo?.source).toEqual({ owner: 'jen', repo: 'isle5-2026' });
        expect(p.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).toMatchObject({
            templateOwner: 'jen',
            templateRepo: 'isle5-2026',
        });
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(p);
        expect(mockRename).toHaveBeenCalledWith(
            { owner: 'jen', repo: 'isle5-demo' },
            { owner: 'jen', repo: 'isle5-2026' },
        );
    });

    it('does not treat a case-only difference in the name as a rename', async () => {
        const p = project();

        const check = await checkDemoSource(
            p,
            repoOps(Promise.resolve({ ...REPO, fullName: 'Jen/Isle5-Demo' })),
            context(),
            okFetch,
        );

        expect(check.renamedTo).toBeUndefined();
        expect(mockRename).not.toHaveBeenCalled();
    });

    it('reports the content site separately when its index is gone', async () => {
        const check = await checkDemoSource(project(), repoOps(Promise.resolve(REPO)), context(), goneFetch);

        expect(check.reachable).toBe(true);
        expect(check.contentReachable).toBe(false);
        expect(check.contentMessage).toBe("The Isle5 by Jen demo's pages can't be reached right now.");
    });

    it('reads the demo\'s own index path when the row states one', async () => {
        const p = project({
            demo: makeAddedDemo({ contentSource: { org: 'jen', site: 'isle5', indexPath: '/en/query-index.json' } }),
        });

        await checkDemoSource(p, repoOps(Promise.resolve(REPO)), context(), okFetch);

        expect(okFetch).toHaveBeenCalledWith(
            'https://main--isle5--jen.aem.live/en/query-index.json',
            expect.anything(),
        );
    });

    it('has nothing to probe for a demo with no content site, and for a project with no demo', async () => {
        const noSite = project({ demo: makeAddedDemo() });
        expect(await checkDemoSource(noSite, repoOps(Promise.resolve(REPO)), context(), goneFetch)).toMatchObject({
            reachable: true,
            contentReachable: true,
        });

        const ops = repoOps(Promise.resolve(REPO));
        expect(await checkDemoSource(project({ demo: undefined }), ops, context(), goneFetch)).toEqual({
            reachable: true,
            checked: true,
            message: '',
            contentReachable: true,
        });
        expect(ops.getRepository).not.toHaveBeenCalled();
    });
});
