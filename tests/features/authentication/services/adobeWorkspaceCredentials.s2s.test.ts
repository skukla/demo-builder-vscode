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

import { makeCredentials, makeSdkClient, ORG, PROJ, WS } from './adobeWorkspaceCredentials.testUtils';

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

describe('getS2SDeployCredentials — every field is checked, and the error names the gap', () => {
    it.each([
        ['clientId', 'apiKey'],
        ['technicalAccountId', 'technicalAccountId'],
        ['technicalAccountEmail', 'technicalAccountEmail'],
        ['imsOrgCode', 'orgCode'],
    ])('a detail without %s (SDK key %s) is refused by name', async (field, sdkKey) => {
        const { client, sdkClient } = makeSdkClient();
        const detail = { ...(await client.getIntegration()).body } as Record<string, string>;
        delete detail[sdkKey];
        client.getIntegration.mockResolvedValue({ body: detail });

        await expect(
            makeCredentials(sdkClient).getS2SDeployCredentials(ORG, PROJ, WS)
        ).rejects.toThrow(new RegExp(`missing ${field} `));
    });

    it('a detail read that answers nothing is the clientId gap, not a crash', async () => {
        const { sdkClient } = makeSdkClient({
            getIntegration: jest.fn().mockResolvedValue(undefined),
        });

        await expect(
            makeCredentials(sdkClient).getS2SDeployCredentials(ORG, PROJ, WS)
        ).rejects.toThrow(/missing clientId /);
    });

    it.each([
        ['nothing at all', undefined],
        ['a body with no client_secrets', { body: {} }],
    ])('a secrets read that answers %s is the clientSecret gap, not a crash', async (_what, answer) => {
        const { sdkClient } = makeSdkClient({
            getIntegrationSecrets: jest.fn().mockResolvedValue(answer),
        });

        await expect(
            makeCredentials(sdkClient).getS2SDeployCredentials(ORG, PROJ, WS)
        ).rejects.toThrow(/missing clientSecret /);
    });
});

describe('getWorkspaceS2SCredential — explicit args, list shape', () => {
    it('returns BOTH ids of the matching entry: client_id and id_integration', async () => {
        const { sdkClient } = makeSdkClient({
            getCredentials: jest.fn().mockResolvedValue({
                body: [
                    {
                        integration_type: 'oauth_server_to_server',
                        id_integration: '1055555',
                        client_id: 'client-id-abc',
                    },
                ],
            }),
        });

        await expect(
            makeCredentials(sdkClient).getWorkspaceS2SCredential(ORG, PROJ, WS)
        ).resolves.toEqual({ clientId: 'client-id-abc', idIntegration: '1055555' });
    });

    it('an entry without client_id keeps its id_integration and an EMPTY clientId', async () => {
        const { sdkClient } = makeSdkClient({
            getCredentials: jest.fn().mockResolvedValue({
                body: [{ integration_type: 'oauth_server_to_server', id_integration: '1055555' }],
            }),
        });

        await expect(
            makeCredentials(sdkClient).getWorkspaceS2SCredential(ORG, PROJ, WS)
        ).resolves.toEqual({ clientId: '', idIntegration: '1055555' });
    });

    it.each([
        ['nothing at all', undefined],
        ['a body-less answer', {}],
    ])('a list that answers %s means no credential, not a crash', async (_what, answer) => {
        const { sdkClient } = makeSdkClient({
            getCredentials: jest.fn().mockResolvedValue(answer),
        });

        await expect(
            makeCredentials(sdkClient).getWorkspaceS2SCredential(ORG, PROJ, WS)
        ).resolves.toBeUndefined();
    });

    it.each([
        ['orgId', ['', PROJ, WS]],
        ['projectId', [ORG, '', WS]],
        ['workspaceId', [ORG, PROJ, '']],
    ])('refuses when %s alone is missing, before any SDK call', async (_which, args) => {
        const { client, sdkClient } = makeSdkClient();
        const [o, p, w] = args as [string, string, string];

        await expect(
            makeCredentials(sdkClient).getWorkspaceS2SCredential(o, p, w)
        ).rejects.toThrow(/orgId, projectId, and workspaceId are required/);
        expect(client.getCredentials).not.toHaveBeenCalled();
    });

    it('refuses when the SDK is not initialized, before any SDK call', async () => {
        const fake = makeSdkClient();
        fake.isInitialized.mockReturnValue(false);

        await expect(
            makeCredentials(fake.sdkClient).getWorkspaceS2SCredential(ORG, PROJ, WS)
        ).rejects.toThrow(/SDK is not initialized/);
        expect(fake.client.getCredentials).not.toHaveBeenCalled();
    });
});

describe('createWorkspaceS2SCredentialFor — explicit args, create shape', () => {
    it('sends the shared description alongside the suffixed name', async () => {
        const { client, sdkClient } = makeSdkClient();

        await makeCredentials(sdkClient).createWorkspaceS2SCredentialFor(ORG, PROJ, WS);

        expect(client.createOAuthServerToServerCredential).toHaveBeenCalledWith(
            ORG,
            PROJ,
            WS,
            expect.any(String),
            'OAuth Server-to-Server access (Demo Builder)'
        );
    });

    it('returns the create response ids: apiKey as clientId, id as idIntegration', async () => {
        const { sdkClient } = makeSdkClient();

        await expect(
            makeCredentials(sdkClient).createWorkspaceS2SCredentialFor(ORG, PROJ, WS)
        ).resolves.toEqual({ clientId: 'client-id-abc', idIntegration: '1099001' });
    });

    it.each([
        ['nothing at all', undefined],
        ['a body-less answer', {}],
        ['a body without id', { body: { apiKey: 'client-id-abc' } }],
        ['a body without apiKey', { body: { id: '1099001' } }],
    ])('a create that answers %s is refused by the id/apiKey message, not a crash', async (_what, answer) => {
        const { sdkClient } = makeSdkClient({
            createOAuthServerToServerCredential: jest.fn().mockResolvedValue(answer),
        });

        await expect(
            makeCredentials(sdkClient).createWorkspaceS2SCredentialFor(ORG, PROJ, WS)
        ).rejects.toThrow(/response is missing id or apiKey/);
    });

    it.each([
        ['orgId', ['', PROJ, WS]],
        ['projectId', [ORG, '', WS]],
        ['workspaceId', [ORG, PROJ, '']],
    ])('refuses when %s alone is missing, before any SDK call', async (_which, args) => {
        const { client, sdkClient } = makeSdkClient();
        const [o, p, w] = args as [string, string, string];

        await expect(
            makeCredentials(sdkClient).createWorkspaceS2SCredentialFor(o, p, w)
        ).rejects.toThrow(/orgId, projectId, and workspaceId are required/);
        expect(client.createOAuthServerToServerCredential).not.toHaveBeenCalled();
    });

    it('refuses when the SDK is not initialized, before any SDK call', async () => {
        const fake = makeSdkClient();
        fake.isInitialized.mockReturnValue(false);

        await expect(
            makeCredentials(fake.sdkClient).createWorkspaceS2SCredentialFor(ORG, PROJ, WS)
        ).rejects.toThrow(/SDK is not initialized/);
        expect(fake.client.createOAuthServerToServerCredential).not.toHaveBeenCalled();
    });
});

describe('SDK readiness', () => {
    it('initializes the SDK first when it is not ready', async () => {
        const fake = makeSdkClient();
        fake.isInitialized.mockReturnValue(false);

        await makeCredentials(fake.sdkClient)
            .getWorkspaceS2SCredential(ORG, PROJ, WS)
            .catch(() => undefined);

        expect(fake.ensureInitialized).toHaveBeenCalledTimes(1);
    });

    it('does not re-initialize an SDK that is already ready', async () => {
        const fake = makeSdkClient();

        await makeCredentials(fake.sdkClient).getWorkspaceS2SCredential(ORG, PROJ, WS);

        expect(fake.ensureInitialized).not.toHaveBeenCalled();
    });
});
