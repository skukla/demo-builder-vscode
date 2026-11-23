/**
 * resolveCloudCleanup — the agent's version of the button's checklist (AI-9).
 *
 * The delete-project button shows two boxes, both unticked, over the setting
 * `demoBuilder.cleanupBehavior`. These pin that an agent gets the same answer
 * from the same setting: `ask` leaves them unticked, `deleteAll` ticks both, and
 * `localOnly` refuses them however the call was written.
 *
 * AND agentCloudOutcome — the agent's answer, read off the button's own delete
 * (`runProjectDelete`, PL-104 fix 6). The sign-in the teardown runs on is no longer
 * this file's: `cleanUpProjectCloud`, which chose it, is deleted, and the one rule
 * (the DA.live session, or stop) is pinned in `storefrontTeardown.test.ts` and
 * `edsExternalCleanup.test.ts`.
 */

import * as vscode from 'vscode';
import { agentCloudOutcome, resolveCloudCleanup } from '@/features/ai/server/agentProjectCleanup';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import type { StorefrontTeardownResult } from '@/features/eds/services/storefront/storefrontTeardown';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';

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

// Uninstall Datapack (walk F96): only when the call asks, under any setting but localOnly.
// deleteAll never ticks it: it writes to a store, and the button never removes it without a tick.
describe("the datapack's data", () => {
    it.each(['ask', 'deleteAll'])('under %s, is removed only when the call asks', (setting) => {
        behavior(setting);

        expect(resolveCloudCleanup({ removeData: true }).removeData).toBe(true);
        expect(resolveCloudCleanup({}).removeData).toBeUndefined();
        expect(resolveCloudCleanup({ removeData: false }).removeData).toBeUndefined();
    });

    it('is refused under localOnly, saying why', () => {
        behavior('localOnly');

        const choice = resolveCloudCleanup({ removeData: true });

        expect(choice.removeData).toBeUndefined();
        expect(choice.refusedBySetting).toContain('localOnly');
    });
});

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

const TORN: StorefrontTeardownResult = {
    contentDeleted: true,
    deletedCount: 7,
    unpublishedPages: 3,
    stillPublished: false,
    publishState: 'down',
    publishSummary: 'The pages are off the live site.',
    productPages: { status: 'removed', found: 2, liveRemoved: 2, previewRemoved: 2, summary: 'Removed 2 product pages.' },
};

describe("agentCloudOutcome: the agent's answer from the button delete", () => {
    it("is the teardown's own result for the site, and the repository with its code", () => {
        const rows: CleanupResultItem[] = [
            { type: 'daLive', name: 'acme/site', success: true },
            { type: 'github', name: 'acme/site', success: true },
        ];

        const outcome = agentCloudOutcome(storefrontProject(), { storefront: TORN, siteCode: { removed: 12, failed: [], stillServing: false } }, rows);

        expect(outcome).toStrictEqual({
            daLiveSite: {
                name: 'acme/site',
                contentDeleted: true,
                unpublishedPages: 3,
                stillPublished: false,
                publishSummary: 'The pages are off the live site.',
                productPages: 'Removed 2 product pages.',
                error: undefined,
            },
            githubRepo: { name: 'acme/site', deleted: true, siteCode: { removed: 12, notRemoved: 0, stillServing: false } },
        });
    });

    it('says the pages may still be live, with why, when a sign-in kept the teardown from running', () => {
        const refused = 'Not signed in to DA.live, so the storefront was not taken down.';

        const outcome = agentCloudOutcome(storefrontProject(), {}, [{ type: 'daLive', name: 'acme/site', success: false, skipped: true, error: refused }]);

        expect(outcome.daLiveSite).toMatchObject({ name: 'acme/site', contentDeleted: false, stillPublished: true, error: refused });
    });

    it('carries the stop, and a kept repository, when the site code could not be removed', () => {
        const kept = 'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.';

        const outcome = agentCloudOutcome(storefrontProject(), { stopped: kept }, [{ type: 'github', name: 'acme/site', success: false, error: kept }]);

        expect(outcome).toStrictEqual({ stopped: kept, githubRepo: { name: 'acme/site', deleted: false, error: kept } });
    });

    it('carries no stop that came from the datapack, which is not an online outcome', () => {
        expect(agentCloudOutcome(storefrontProject(), { stopped: 'Its datapack was not uninstalled.' }, [])).toStrictEqual({});
    });

    it('says nothing about resources the delete was not asked to touch', () => {
        expect(agentCloudOutcome(storefrontProject(), {}, [])).toStrictEqual({});
        expect(agentCloudOutcome(createMockProject({}), { storefront: TORN }, [])).toStrictEqual({});
    });
});
