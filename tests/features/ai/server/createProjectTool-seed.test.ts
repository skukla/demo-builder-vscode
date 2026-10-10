/**
 * create_project — what a seed (a project file's selections) adds to a creation,
 * and what storefront setup's answer puts on the project (PL-70).
 *
 * Driven through `runProjectCreation`, the one creation path both doors end at.
 * Every case asserts what a collaborator was HANDED: the wizard state given to
 * `buildProjectConfig`, or the payload given to storefront setup.
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { StorefrontSetupCompletePayload } from '@/types/webviewPayloads';

import {
    authManager,
    capturedWizardState,
    ctxFactory,
    defaultStorefrontSetup,
    getAutoSelectedOptionalDependencies,
    runProjectCreation,
    storefrontSetup,
} from './createProjectTool.testUtils';

const HEADLESS = { projectName: 'my-proj', pkgId: 'citisignal', stackId: 'headless-paas' };
const EDS = {
    projectName: 'eds-proj',
    pkgId: 'citisignal',
    stackId: 'eds-paas',
    repoName: 'my-repo',
    daLiveOrg: 'org',
    daLiveSite: 'site',
};

const MESH = COMPONENT_IDS.EDS_COMMERCE_MESH;

/** What the stack selects by itself, for this test. */
function autoSelects(ids: string[]): void {
    (getAutoSelectedOptionalDependencies as jest.Mock).mockResolvedValue(ids);
}

/** The payload storefront setup was dispatched with. */
function setupPayload(): { dependencies: string[] } {
    return storefrontSetup.mock.calls[0][1];
}

beforeEach(() => {
    jest.clearAllMocks();
    defaultStorefrontSetup();
    // clearAllMocks keeps implementations: restate the harness default each time.
    autoSelects([]);
});

describe('a seed and the components the stack selects by itself', () => {
    it('keeps the auto-selected components when the seed names none', async () => {
        autoSelects([MESH]);

        await runProjectCreation(ctxFactory(), { ...HEADLESS, seed: {} });

        expect(capturedWizardState().selectedAppBuilderComponents).toStrictEqual([MESH]);
    });

    it("lays the seed's components in first, then the auto-selected ones, once each", async () => {
        autoSelects([MESH]);

        await runProjectCreation(ctxFactory(), {
            ...HEADLESS,
            seed: { selectedAppBuilderComponents: ['erp-integration', MESH] },
        });

        expect(capturedWizardState().selectedAppBuilderComponents).toStrictEqual([
            'erp-integration',
            MESH,
        ]);
    });
});

describe("a seed's own selections", () => {
    it('replace the empty defaults a plain creation starts from', async () => {
        const custom = [{ name: 'Mine', source: { owner: 'me', repo: 'blocks', branch: 'main' } }];

        await runProjectCreation(ctxFactory(), {
            ...HEADLESS,
            seed: {
                selectedAddons: ['adobe-commerce-aco'],
                selectedBlockLibraries: ['isle5'],
                customBlockLibraries: custom,
            },
        });

        const state = capturedWizardState();
        expect(state.selectedAddons).toStrictEqual(['adobe-commerce-aco']);
        expect(state.selectedBlockLibraries).toStrictEqual(['isle5']);
        expect(state.customBlockLibraries).toStrictEqual(custom);
    });

    it('leave the empty defaults in place where the seed says nothing', async () => {
        await runProjectCreation(ctxFactory(), { ...HEADLESS, seed: {} });

        const state = capturedWizardState();
        expect(state.selectedAddons).toStrictEqual([]);
        expect(state.selectedBlockLibraries).toStrictEqual([]);
        expect(state.customBlockLibraries).toStrictEqual([]);
    });

    // An integration a project file names is deployed to Adobe, mesh or no mesh,
    // so the creation needs the Adobe sign-in a mesh-free package otherwise skips.
    it('ask for the Adobe sign-in when they name an integration to deploy', async () => {
        authManager.isAuthenticated.mockResolvedValueOnce(false);

        const res = await runProjectCreation(ctxFactory(), {
            ...HEADLESS,
            seed: { selectedAppBuilderComponents: ['erp-integration'] },
        });

        expect(JSON.parse(res.content[0].text)).toMatchObject({ needsAuth: 'adobe' });
    });
});

describe('what storefront setup is told to deploy', () => {
    it('names the auto-selected components', async () => {
        autoSelects([MESH]);

        await runProjectCreation(ctxFactory(), EDS);

        expect(setupPayload().dependencies).toStrictEqual([MESH]);
    });

    // Setup deploys meshes only; an integration a project file names is installed
    // later, by creation, and must not be handed to setup as a dependency.
    it("adds a seed's mesh and leaves its integrations out", async () => {
        await runProjectCreation(ctxFactory(), {
            ...EDS,
            seed: { selectedAppBuilderComponents: ['erp-integration', MESH] },
        });

        expect(setupPayload().dependencies).toStrictEqual([MESH]);
    });

    it('names nothing when neither the stack nor a seed selects a mesh', async () => {
        await runProjectCreation(ctxFactory(), EDS);

        expect(setupPayload().dependencies).toStrictEqual([]);
    });
});

describe('the broken links storefront setup found', () => {
    it('are recorded on the project creation is handed', async () => {
        const brokenLinks = [{ link: '/fr', pages: ['/footer'] }];
        storefrontSetup.mockImplementationOnce(
            async (ctx: { sendMessage: (t: string, d?: unknown) => Promise<void> }) => {
                await ctx.sendMessage('storefront-setup-complete', {
                    message: 'Done',
                    githubRepo: 'https://github.com/o/r',
                    brokenLinks,
                } satisfies StorefrontSetupCompletePayload);
                return { success: true };
            },
        );

        await runProjectCreation(ctxFactory(), EDS);

        expect(capturedWizardState().edsConfig.brokenLinks).toStrictEqual(brokenLinks);
    });

    it('leave no field behind when there are none', async () => {
        await runProjectCreation(ctxFactory(), EDS);

        expect(capturedWizardState().edsConfig).not.toHaveProperty('brokenLinks');
    });
});
