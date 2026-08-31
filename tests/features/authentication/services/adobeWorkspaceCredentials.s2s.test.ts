/**
 * Workspace S2S credential — creation naming + the full-identity read
 * (2026-08-27, the App Management deploy-env work).
 *
 * The create-name assertion pins the org-uniqueness fix: Console credential
 * names are unique across the ORG (measured live: a second workspace's plain
 * `demo-builder-s2s` answered 409 "Duplicate application name"), so the name
 * carries the workspace id's tail. Response fixtures mirror the live shapes
 * read the same day (created/detail/secrets keys).
 */

import { AdobeWorkspaceCredentials } from '@/features/authentication/services/adobeWorkspaceCredentials';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

const ORG = '285361';
const PROJ = '4566206088345738527';
const WS = '4566206088345780697';

/** Live-shaped SDK responses (keys read from a real credential, 2026-08-27). */
function makeSdkClient(overrides: Record<string, jest.Mock> = {}) {
    const client = {
        getCredentials: jest.fn().mockResolvedValue({ body: [] }),
        createOAuthServerToServerCredential: jest
            .fn()
            .mockResolvedValue({ body: { id: '1099001', apiKey: 'client-id-abc' } }),
        getIntegration: jest.fn().mockResolvedValue({
            body: {
                apiKey: 'client-id-abc',
                technicalAccountId: 'ta-id-1',
                technicalAccountEmail: 'ta@techacct.adobe.com',
                orgCode: '8EBB33FE5E43BA110A495EF8@AdobeOrg',
            },
        }),
        getIntegrationSecrets: jest.fn().mockResolvedValue({
            body: {
                client_id: 'client-id-abc',
                client_secrets: [{ client_secret: 'fake-test-pw-not-a-secret' }],
            },
        }),
        ...overrides,
    };
    const sdkClient = {
        isInitialized: () => true,
        ensureInitialized: jest.fn().mockResolvedValue(true),
        getClient: () => client,
    } as unknown as AdobeSDKClient;
    return { client, sdkClient };
}

function makeCredentials(sdkClient: AdobeSDKClient) {
    return new AdobeWorkspaceCredentials(sdkClient, {} as AuthCacheManager);
}

describe('createWorkspaceS2SCredentialFor — org-unique naming', () => {
    it('creates with the WORKSPACE-SUFFIXED name, never the bare fixed one', async () => {
        const { client, sdkClient } = makeSdkClient();

        await makeCredentials(sdkClient).createWorkspaceS2SCredentialFor(ORG, PROJ, WS);

        expect(client.createOAuthServerToServerCredential).toHaveBeenCalledWith(
            ORG,
            PROJ,
            WS,
            `demo-builder-s2s-${WS.slice(-8)}`,
            expect.any(String)
        );
    });
});

describe('getS2SDeployCredentials', () => {
    it('creates when absent, then reads detail + secret into the full identity', async () => {
        const { client, sdkClient } = makeSdkClient();

        const result = await makeCredentials(sdkClient).getS2SDeployCredentials(ORG, PROJ, WS);

        expect(result).toEqual({
            clientId: 'client-id-abc',
            clientSecret: 'fake-test-pw-not-a-secret',
            technicalAccountId: 'ta-id-1',
            technicalAccountEmail: 'ta@techacct.adobe.com',
            imsOrgCode: '8EBB33FE5E43BA110A495EF8@AdobeOrg',
        });
        // Detail + secrets are read for the integration the ensure resolved.
        expect(client.getIntegration).toHaveBeenCalledWith(ORG, '1099001');
        expect(client.getIntegrationSecrets).toHaveBeenCalledWith(ORG, '1099001');
    });

    it('reuses an EXISTING oauth_server_to_server credential (matched by type, not name)', async () => {
        const { client, sdkClient } = makeSdkClient({
            getCredentials: jest.fn().mockResolvedValue({
                body: [
                    // The apikey credential a mesh workspace carries must not match.
                    { integration_type: 'apikey', id_integration: '1022842', client_id: 'x' },
                    {
                        integration_type: 'oauth_server_to_server',
                        id_integration: '1055555',
                        client_id: 'client-id-abc',
                    },
                ],
            }),
        });

        await makeCredentials(sdkClient).getS2SDeployCredentials(ORG, PROJ, WS);

        expect(client.createOAuthServerToServerCredential).not.toHaveBeenCalled();
        expect(client.getIntegration).toHaveBeenCalledWith(ORG, '1055555');
    });

    it('a credential missing its secret is an error NAMING the gap, not a partial env', async () => {
        const { sdkClient } = makeSdkClient({
            getIntegrationSecrets: jest.fn().mockResolvedValue({ body: { client_secrets: [] } }),
        });

        await expect(
            makeCredentials(sdkClient).getS2SDeployCredentials(ORG, PROJ, WS)
        ).rejects.toThrow(/clientSecret/);
    });
});
