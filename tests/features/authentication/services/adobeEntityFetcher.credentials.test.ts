/**
 * AdobeEntityFetcher — the credential and Runtime delegates.
 *
 * The facade forwards four calls to AdobeWorkspaceCredentials and
 * AdobeConsoleProjectOps, which it constructs itself. These tests drive the
 * REAL delegates through the facade and assert the arguments that reach the
 * Console SDK client — the one boundary that is mocked — so a facade method
 * whose body stopped forwarding (or forwarded the wrong ids) is caught here
 * rather than agreed with. Before this suite none of the four had a test.
 *
 * All ids and secrets are obviously fake — this repo is public.
 */

import { setupEntityFetcher, type EntityFetcherHarness } from './adobeEntityFetcher.testUtils';

const ORG = 'org-1';
const PROJECT = 'proj-1';
const WORKSPACE = 'ws-1';
const FAKE_SECRET = 'fake-test-client-secret-not-a-secret';

interface ConsoleClientFake {
    getCredentials: jest.Mock;
    createOAuthServerToServerCredential: jest.Mock;
    getIntegration: jest.Mock;
    getIntegrationSecrets: jest.Mock;
    createRuntimeNamespace: jest.Mock;
}

function pointCacheAtWorkspace(h: EntityFetcherHarness): void {
    h.mockCacheManager.getCachedOrganization.mockReturnValue({ id: ORG, code: 'org', name: 'Org' });
    h.mockCacheManager.getCachedProject.mockReturnValue({ id: PROJECT, name: 'proj', title: 'Proj' });
    h.mockCacheManager.getCachedWorkspace.mockReturnValue({ id: WORKSPACE, name: 'Stage' });
}

describe('AdobeEntityFetcher — credential and Runtime delegates', () => {
    let h: EntityFetcherHarness;
    let client: ConsoleClientFake;

    beforeEach(() => {
        h = setupEntityFetcher();
        client = {
            getCredentials: jest.fn().mockResolvedValue({ body: [] }),
            createOAuthServerToServerCredential: jest.fn(),
            getIntegration: jest.fn(),
            getIntegrationSecrets: jest.fn(),
            createRuntimeNamespace: jest.fn().mockResolvedValue({ body: {} }),
        };
        h.mockSDKClient.isInitialized.mockReturnValue(true);
        h.mockSDKClient.getClient.mockReturnValue(client);
    });

    it('getWorkspaceCredential lists the cached workspace and returns its OAuth S2S client id', async () => {
        pointCacheAtWorkspace(h);
        client.getCredentials.mockResolvedValue({
            body: [
                { client_id: 'adobeid-cid', integration_type: 'apikey', integration_name: 'Web' },
                { client_id: 's2s-cid', integration_type: 'oauth_server_to_server', integration_name: 'Server' },
            ],
        });

        const credential = await h.fetcher.getWorkspaceCredential();

        expect(client.getCredentials).toHaveBeenCalledWith(ORG, PROJECT, WORKSPACE);
        expect(credential).toEqual({
            clientId: 's2s-cid',
            name: 'Server',
            source: 'oauth_server_to_server',
        });
    });

    it('createWorkspaceCredential creates on the cached workspace with the given name and description', async () => {
        pointCacheAtWorkspace(h);
        client.createOAuthServerToServerCredential.mockResolvedValue({
            body: { id: 'int-1', apiKey: 'new-cid', orgId: ORG },
        });

        const credential = await h.fetcher.createWorkspaceCredential('Demo Builder', 'Created by the wizard');

        expect(client.createOAuthServerToServerCredential).toHaveBeenCalledWith(
            ORG,
            PROJECT,
            WORKSPACE,
            'Demo Builder',
            'Created by the wizard',
        );
        expect(credential).toEqual({
            clientId: 'new-cid',
            name: 'Demo Builder',
            source: 'oauth_server_to_server',
        });
    });

    it('getS2SDeployCredentials reads the existing S2S integration detail and secret for the given ids', async () => {
        client.getCredentials.mockResolvedValue({
            body: [{ client_id: 's2s-cid', integration_type: 'oauth_server_to_server', id_integration: 'int-9' }],
        });
        client.getIntegration.mockResolvedValue({
            body: {
                apiKey: 's2s-cid',
                technicalAccountId: 'ta-1@techacct.adobe.com',
                technicalAccountEmail: 'ta-1@techacct.adobe.com',
                orgCode: 'ORG1@AdobeOrg',
            },
        });
        client.getIntegrationSecrets.mockResolvedValue({
            body: { client_secrets: [{ client_secret: FAKE_SECRET }] },
        });

        const creds = await h.fetcher.getS2SDeployCredentials(ORG, PROJECT, WORKSPACE);

        expect(client.getCredentials).toHaveBeenCalledWith(ORG, PROJECT, WORKSPACE);
        expect(client.getIntegration).toHaveBeenCalledWith(ORG, 'int-9');
        expect(client.getIntegrationSecrets).toHaveBeenCalledWith(ORG, 'int-9');
        expect(client.createOAuthServerToServerCredential).not.toHaveBeenCalled();
        expect(creds).toEqual({
            clientId: 's2s-cid',
            clientSecret: FAKE_SECRET,
            technicalAccountId: 'ta-1@techacct.adobe.com',
            technicalAccountEmail: 'ta-1@techacct.adobe.com',
            imsOrgCode: 'ORG1@AdobeOrg',
        });
    });

    it('ensureWorkspaceRuntimeNamespace provisions Runtime on exactly the given workspace', async () => {
        await expect(
            h.fetcher.ensureWorkspaceRuntimeNamespace(ORG, PROJECT, WORKSPACE),
        ).resolves.toBeUndefined();

        expect(client.createRuntimeNamespace).toHaveBeenCalledTimes(1);
        expect(client.createRuntimeNamespace).toHaveBeenCalledWith(ORG, PROJECT, WORKSPACE);
    });
});
