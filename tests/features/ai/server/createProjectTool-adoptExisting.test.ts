/**
 * create_project's adoptExisting: rebuild a project on a repository and DA.live site
 * that already exist, as the wizard's "use existing" choice does.
 *
 * Without it the agent could only ask for a NEW repository, so rebuilding a deleted
 * project whose storefront survived failed on "Repository name already exists", and
 * the tool's own retry hint ("skipped on retry") promised a mechanism nothing
 * implemented (2026-10-16). Asserted on the storefront-setup payload, because a
 * mocked setup answers the same whatever it is handed. Mocks are owned by
 * `createProjectTool.testUtils.ts`.
 */

import {
    EDS,
    capturedWizardState,
    defaultStorefrontSetup,
    getStorefrontForStack,
    storefrontSetup,
    toolServer,
} from './createProjectTool.testUtils';

const setupConfig = () => storefrontSetup.mock.calls[0][1].edsConfig;

describe('create_project — adoptExisting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    it('asks for a new repository when it is not given', async () => {
        await toolServer().call(EDS);

        expect(setupConfig().repoMode).toBe('new');
        expect(setupConfig().existingRepo).toBeUndefined();
        expect(setupConfig().selectedSite).toBeUndefined();
    });

    it("uses the signed-in account's repository and the named site, as the wizard's existing choice", async () => {
        await toolServer().call({ ...EDS, adoptExisting: true });

        expect(setupConfig()).toMatchObject({
            repoMode: 'existing',
            existingRepo: 'steve/my-repo',
            // A selected site with no reset keeps its content (storefrontSetupPhases).
            selectedSite: { id: 'site', name: 'site' },
        });
        expect(setupConfig().resetToTemplate).toBeUndefined();
        expect(setupConfig().resetSiteContent).toBeUndefined();
    });

    it('names the repository under the owner the caller gives', async () => {
        await toolServer().call({ ...EDS, adoptExisting: true, githubOwner: 'acme' });

        expect(setupConfig().existingRepo).toBe('acme/my-repo');
    });

    it('carries the existing choice into creation, which records the adopted repository', async () => {
        await toolServer().call({ ...EDS, adoptExisting: true });

        expect(capturedWizardState().edsConfig).toMatchObject({
            repoMode: 'existing',
            existingRepo: 'steve/my-repo',
        });
    });

    it('tells a failed run how to retry on what it already made', async () => {
        storefrontSetup.mockResolvedValueOnce({ success: false, error: 'Repository name already exists' });

        const res = await toolServer().call(EDS);

        expect(res.hint).toContain('adoptExisting:true');
        expect(res.hint).not.toContain('skipped on retry');
    });
});

describe('create_project — the storefront fields creation records (EDS-51)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    it("hands creation the storefront's patches and their source, so the project knows its tested version", async () => {
        // Without codePatchSource the project records no lkgSource, and Check for
        // Updates treats it as a plain fork of Adobe's latest commit.
        const codePatchSource = { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b', lkgFile: 'b2b/last-known-good' };
        (getStorefrontForStack as jest.Mock).mockResolvedValueOnce({
            templateOwner: 'adobe-commerce',
            templateRepo: 'boilerplate-b2b-template',
            contentSource: { org: 'co', site: 'cs' },
            codePatches: ['pdp-empty-data-redirect'],
            codePatchSource,
        });

        await toolServer().call(EDS);

        expect(capturedWizardState().edsConfig).toMatchObject({
            codePatches: ['pdp-empty-data-redirect'],
            codePatchSource,
        });
    });
});
