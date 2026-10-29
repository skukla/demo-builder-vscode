/**
 * resolveCloudCleanup — the agent's version of the button's checklist (AI-9).
 *
 * The delete-project button shows two boxes, both unticked, over the setting
 * `demoBuilder.cleanupBehavior`. These pin that an agent gets the same answer
 * from the same setting: `ask` leaves them unticked, `deleteAll` ticks both, and
 * `localOnly` refuses them however the call was written.
 *
 * AND cleanUpProjectCloud — which sign-in an agent's delete hands the storefront teardown.
 *
 * The teardown unpublishes through Helix, and a registered site's Helix admin API
 * accepts ONE credential: the DA.live session's token. The Adobe Console token is a
 * different sign-in and Helix answers it "[admin] not authenticated".
 *
 * Measured live 2026-10-12, on a storefront made and reset for the purpose: an agent's
 * `delete_project` got a 401 on the page listing and on every one of 63 unpublishes,
 * deleted the repository and the DA.live content anyway, and left the site answering.
 * `cleanup_dalive_site`, on the same site a minute later with the DA.live session,
 * unpublished 59 pages and 49 product pages. The only difference was the token.
 *
 * So these assert the ARGUMENT. The teardown is mocked, and a mocked teardown answers
 * the same whichever token it is handed — which is how this went unnoticed.
 */

import * as vscode from 'vscode';
import { cleanUpProjectCloud, resolveCloudCleanup } from '@/features/ai/server/agentProjectCleanup';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';

const mockTearDown = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontTeardown', () => ({
    tearDownStorefront: (...args: unknown[]) => mockTearDown(...args),
}));

const mockDaLiveSessionToken = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: () => ({ getAccessToken: () => mockDaLiveSessionToken() }),
    getGitHubServices: jest.fn(),
    tryCreateDaLiveTokenProvider: () => ({ getAccessToken: () => mockDaLiveSessionToken() }),
}));

// The repository delete and the code removal after it (EDS-67). Mocked, so these assert
// what it was HANDED; the order inside it is `storefrontCodeRemoval.test.ts`'s.
const mockDeleteStorefrontRepository = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontCodeRemoval', () => ({
    deleteStorefrontRepository: (...args: unknown[]) => mockDeleteStorefrontRepository(...args),
}));

const mockInspectToken = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: () => ({ getTokenManager: () => ({ inspectToken: () => mockInspectToken() }) }),
    },
}));

jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: { initKeyStore: jest.fn() },
}));

const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;

/** Put the SC's setting where the resolver reads it. */
function behavior(value: string): void {
    getConfiguration.mockReturnValue({ get: (_key: string, fallback: string) => value ?? fallback });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('the default, "ask"', () => {
    it('leaves both boxes unticked when the call names neither', () => {
        behavior('ask');

        expect(resolveCloudCleanup({})).toEqual({
            deleteGithubRepo: false,
            deleteDaLiveSite: false,
        });
    });

    it('ticks exactly what the call asked for', () => {
        behavior('ask');

        expect(resolveCloudCleanup({ deleteDaLiveSite: true })).toEqual({
            deleteGithubRepo: false,
            deleteDaLiveSite: true,
        });
    });
});

describe('"deleteAll"', () => {
    it('ticks both, as the dialog does', () => {
        behavior('deleteAll');

        expect(resolveCloudCleanup({})).toEqual({
            deleteGithubRepo: true,
            deleteDaLiveSite: true,
        });
    });

    it('still lets a call keep one of them', () => {
        behavior('deleteAll');

        expect(resolveCloudCleanup({ deleteGithubRepo: false })).toEqual({
            deleteGithubRepo: false,
            deleteDaLiveSite: true,
        });
    });
});

describe('"localOnly"', () => {
    it('refuses both, and says why, when a call asked for them', () => {
        behavior('localOnly');

        const choice = resolveCloudCleanup({ deleteGithubRepo: true, deleteDaLiveSite: true });

        expect(choice.deleteGithubRepo).toBe(false);
        expect(choice.deleteDaLiveSite).toBe(false);
        expect(choice.refusedBySetting).toContain('localOnly');
    });

    it('says nothing when nothing was asked for', () => {
        behavior('localOnly');

        expect(resolveCloudCleanup({}).refusedBySetting).toBeUndefined();
    });
});

// The demo's own library pack (step 07): deleted only when the call asks, under any setting
// but localOnly. deleteAll never ticks it, as the button never deletes it without a tick.
describe('the demo\'s own pack', () => {
    it.each(['ask', 'deleteAll'])('under %s, is deleted only when the call asks', (setting) => {
        behavior(setting);

        expect(resolveCloudCleanup({ deletePack: true }).deletePack).toBe(true);
        expect(resolveCloudCleanup({}).deletePack).toBeUndefined();
        expect(resolveCloudCleanup({ deletePack: false }).deletePack).toBeUndefined();
    });

    it('is refused under localOnly, saying why', () => {
        behavior('localOnly');

        const choice = resolveCloudCleanup({ deletePack: true });

        expect(choice.deletePack).toBeUndefined();
        expect(choice.refusedBySetting).toContain('localOnly');
    });
});

const DA_LIVE_TOKEN = 'da-live-session-token';
const ADOBE_TOKEN = 'adobe-console-token';

function storefrontProject() {
    return createMockProject({
        selectedStack: 'eds-accs',
        componentInstances: {
            'eds-storefront': {
                ...edsStorefrontInstance(),
                metadata: { githubRepo: 'acme/site', daLiveOrg: 'acme', daLiveSite: 'site' },
            },
        },
    });
}

/** The token the teardown would send, read off the provider it was handed. */
async function tokenHandedToTeardown(): Promise<string | null> {
    const deps = mockTearDown.mock.calls[0][1] as { tokenProvider: { getAccessToken(): Promise<string | null> } };
    return deps.tokenProvider.getAccessToken();
}

beforeEach(() => {
    mockTearDown.mockResolvedValue({ contentDeleted: true, unpublishedPages: 3, stillPublished: false });
    mockInspectToken.mockResolvedValue({ valid: true, token: ADOBE_TOKEN });
});

describe('the sign-in an agent delete hands the storefront teardown', () => {
    it('is the DA.live session, when there is one', async () => {
        mockDaLiveSessionToken.mockResolvedValue(DA_LIVE_TOKEN);

        const outcome = await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: true,
            deleteGithubRepo: false,
        });

        expect(await tokenHandedToTeardown()).toBe(DA_LIVE_TOKEN);
        expect(outcome.daLiveSite).toMatchObject({ name: 'acme/site', contentDeleted: true, stillPublished: false });
    });

    it('falls back to the Adobe sign-in only when there is no DA.live session', async () => {
        mockDaLiveSessionToken.mockResolvedValue(null);

        await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: true,
            deleteGithubRepo: false,
        });

        expect(await tokenHandedToTeardown()).toBe(ADOBE_TOKEN);
    });

    it('takes nothing down, and says the pages may still be live, when neither sign-in is usable', async () => {
        mockDaLiveSessionToken.mockResolvedValue(null);
        mockInspectToken.mockResolvedValue({ valid: false });

        const outcome = await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: true,
            deleteGithubRepo: false,
        });

        expect(mockTearDown).not.toHaveBeenCalled();
        expect(outcome.daLiveSite).toMatchObject({ name: 'acme/site', contentDeleted: false, stillPublished: true });
        expect(outcome.daLiveSite?.error).toContain('DA.live');
    });
});

// EDS-65: on 2026-10-25 the DA.live sign-in had expired, the Adobe fallback was refused
// by Helix, and the repository was deleted anyway. A teardown that stopped keeps it.
describe('when the teardown stops because the pages are still live', () => {
    const STOPPED = 'The pages could not be taken off the live site, so nothing else was deleted.';

    it('keeps the repository and says why', async () => {
        mockDaLiveSessionToken.mockResolvedValue(null);
        mockTearDown.mockResolvedValue({ contentDeleted: false, stillPublished: true, stopped: STOPPED, error: STOPPED });
        const { getGitHubServices } = jest.requireMock('@/features/eds/handlers/edsHelpers') as { getGitHubServices: jest.Mock };

        const outcome = await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: true,
            deleteGithubRepo: true,
        });

        expect(getGitHubServices).not.toHaveBeenCalled();
        expect(outcome.githubRepo).toBeUndefined();
        expect(outcome.stopped).toBe(STOPPED);
        expect(outcome.daLiveSite).toMatchObject({ contentDeleted: false, stillPublished: true, error: STOPPED });
    });
});

// EDS-67: the repository went and AEM's copy of its code stayed on aem.live.
describe("an agent's repository delete, and the site's code after it", () => {
    const repoLifecycle = { deleteRepository: jest.fn() };
    const fileOperations = { listRepoFiles: jest.fn() };

    beforeEach(() => {
        const { getGitHubServices } = jest.requireMock('@/features/eds/handlers/edsHelpers') as {
            getGitHubServices: jest.Mock;
        };
        getGitHubServices.mockReturnValue({ repoLifecycle, fileOperations });
        repoLifecycle.deleteRepository.mockResolvedValue(undefined);
        mockDeleteStorefrontRepository.mockResolvedValue({
            code: { removed: 12, failed: [], stillServing: false },
        });
    });

    it('deletes THE repository through the code removal, which lists its files first', async () => {
        mockDaLiveSessionToken.mockResolvedValue(DA_LIVE_TOKEN);

        await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: false,
            deleteGithubRepo: true,
        });

        expect(mockDeleteStorefrontRepository).toHaveBeenCalledTimes(1);
        const [target, deps] = mockDeleteStorefrontRepository.mock.calls[0] as [
            unknown,
            {
                files: unknown;
                deleteRepository: (o: string, r: string) => Promise<void>;
                tokenProvider: { getAccessToken(): Promise<string | null> };
            },
        ];
        expect(target).toStrictEqual({ owner: 'acme', repo: 'site' });
        expect(deps.files).toBe(fileOperations);
        await deps.deleteRepository('acme', 'site');
        expect(repoLifecycle.deleteRepository).toHaveBeenCalledWith('acme', 'site');
        // The DA.live session: the one credential the code bus DELETE was measured with.
        expect(await deps.tokenProvider.getAccessToken()).toBe(DA_LIVE_TOKEN);
    });

    it('says the code is gone only when aem.live no longer serves it', async () => {
        const outcome = await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: false,
            deleteGithubRepo: true,
        });

        expect(outcome.githubRepo).toStrictEqual({
            name: 'acme/site',
            deleted: true,
            siteCode: { removed: 12, notRemoved: 0, stillServing: false },
        });
    });

    it("carries the sentence when the code is left, so a 'deleted' is never said over it", async () => {
        const summary = "The site's code was removed from aem.live, but aem.live still serves its scripts/aem.js.";
        mockDeleteStorefrontRepository.mockResolvedValue({
            code: { removed: 0, failed: [], stillServing: true, summary },
        });

        const outcome = await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: false,
            deleteGithubRepo: true,
        });

        expect(outcome.githubRepo?.siteCode).toStrictEqual({ removed: 0, notRemoved: 0, stillServing: true, summary });
    });

    // Owner, 2026-10-28: with no working DA.live sign-in the repository is kept, and the
    // project with it, so "delete again" can still remove the site code.
    it('keeps the repository and stops the delete when there is no working DA.live sign-in', async () => {
        const kept = 'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.';
        mockDeleteStorefrontRepository.mockResolvedValue({ kept });

        const outcome = await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: false,
            deleteGithubRepo: true,
        });

        expect(outcome.githubRepo).toStrictEqual({ name: 'acme/site', deleted: false, error: kept });
        expect(outcome.stopped).toBe(kept);
    });

    it('reports a refused repository delete, with no code outcome', async () => {
        mockDeleteStorefrontRepository.mockRejectedValue(new Error('403 from GitHub'));

        const outcome = await cleanUpProjectCloud(createMockHandlerContext(), storefrontProject(), {
            deleteDaLiveSite: false,
            deleteGithubRepo: true,
        });

        expect(outcome.githubRepo).toStrictEqual({ name: 'acme/site', deleted: false, error: '403 from GitHub' });
    });
});
