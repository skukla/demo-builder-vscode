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
