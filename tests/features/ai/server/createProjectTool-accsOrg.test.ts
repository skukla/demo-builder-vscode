/**
 * `create_project` records the Adobe organization of every ACCS project, as the wizard does, not
 * only of one that deploys to Adobe (owner, 2026-11-04, release test F11).
 *
 * The wizard signs every ACCS project in to Adobe and writes the org into the project file. The
 * tool signed in only when the creation deployed a mesh or an integration, so an agent's Edge
 * Delivery + ACCS storefront with no mesh recorded no org: `patch-canary-b2b` (2026-10-16). A
 * Commerce write on it was then refused for want of a credential, and the reset batch read its
 * missing org as a second org.
 *
 * The org is the MCP session's (`select_org`), never the machine's last selection: a
 * creation recording whatever another window last chose is the fiction the mesh-free tests in
 * `createProjectTool.test.ts` guard against. Mocks are owned by `createProjectTool.testUtils.ts`.
 */

import {
    EDS,
    authManager,
    capturedWizardState,
    defaultStorefrontSetup,
    executeProjectCreation,
    getAdobeTarget,
    toolServer,
} from './createProjectTool.testUtils';

const ACCS = { ...EDS, stack: 'eds-accs', accsEndpoint: 'https://accs.example/graphql' };

beforeEach(() => {
    jest.clearAllMocks();
    defaultStorefrontSetup();
});

describe('create_project on ACCS, deploying nothing', () => {
    it("records the session's Adobe organization, and no project or workspace", async () => {
        (getAdobeTarget as jest.Mock).mockReturnValueOnce({ orgId: 'org-session', orgCode: 'C1@AdobeOrg', orgName: 'Demo Org' });

        await toolServer().call(ACCS);

        const state = capturedWizardState();
        expect(state.adobeOrg).toMatchObject({ id: 'org-session', name: 'Demo Org' });
        expect(state.adobeProject).toBeUndefined();
        expect(state.adobeWorkspace).toBeUndefined();
    });

    it('asks for the Adobe sign-in first when signed out, and creates nothing', async () => {
        authManager.isAuthenticated.mockResolvedValueOnce(false);

        const res = await toolServer().call(ACCS);

        expect(res).toMatchObject({ needsAuth: 'adobe' });
        expect(JSON.stringify(res)).not.toMatch(/API Mesh/);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('asks for an organization when the session has none, rather than take the machine\'s', async () => {
        (getAdobeTarget as jest.Mock).mockReturnValueOnce(undefined);

        const res = await toolServer().call(ACCS);

        expect(JSON.stringify(res)).toMatch(/select_org/);
        expect(authManager.getCurrentOrganization).not.toHaveBeenCalled();
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });
});

describe('create_project on PaaS, deploying nothing', () => {
    it('still records no Adobe organization (control)', async () => {
        await toolServer().call(EDS);

        expect(capturedWizardState().adobeOrg).toBeUndefined();
    });
});
