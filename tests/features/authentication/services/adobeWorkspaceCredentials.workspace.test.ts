/**
 * The cache-driven credential pair: `getWorkspaceCredential` reads the workspace's
 * OAuth S2S client_id for the ACCS x-api-key, and `createWorkspaceCredential`
 * creates one and primes the in-memory cache the read then answers from.
 *
 * Both take org/project/workspace from the cache manager (the explicit-args
 * S2S trio is in the `.s2s` suite). Both swallow every failure into
 * `undefined`, so what a test can pin is WHICH call the SDK receives — or does
 * not — and what comes back.
 */

import type { RawWorkspaceCredential } from '@/features/authentication/services/types';
import {
    makeCacheManager,
    makeCredentials,
    makeSdkClient,
    ORG,
    PROJ,
    WS,
} from './adobeWorkspaceCredentials.testUtils';

const S2S: RawWorkspaceCredential = {
    integration_type: 'oauth_server_to_server',
    flow_type: 'entp',
    integration_name: 'demo-builder-s2s-45780697',
    client_id: 's2s-client-id',
    id_integration: '1055555',
};
const API_KEY: RawWorkspaceCredential = {
    integration_type: 'apikey',
    flow_type: 'adobeid',
    integration_name: 'demo-builder-api-mesh',
    client_id: 'apikey-client-id',
    id_integration: '1022842',
};
const NAME = 'demo-builder-s2s';
const DESCRIPTION = 'OAuth Server-to-Server access (Demo Builder)';

function listing(...entries: RawWorkspaceCredential[]) {
    return { getCredentials: jest.fn().mockResolvedValue({ body: entries }) };
}

describe('getWorkspaceCredential — which credential answers', () => {
    it('reads the CACHED selection: org, project and workspace ids, in that order', async () => {
        const { client, sdkClient } = makeSdkClient(listing(S2S));

        await makeCredentials(sdkClient).getWorkspaceCredential();

        expect(client.getCredentials).toHaveBeenCalledWith(ORG, PROJ, WS);
    });

    it('prefers the OAuth S2S entry even when an apiKey entry is listed first', async () => {
        const { sdkClient } = makeSdkClient(listing(API_KEY, S2S));

        await expect(makeCredentials(sdkClient).getWorkspaceCredential()).resolves.toEqual({
            clientId: 's2s-client-id',
            name: 'demo-builder-s2s-45780697',
            source: 'oauth_server_to_server',
        });
    });

    it('falls back to ANY entry with a client_id when no S2S entry has one', async () => {
        const noClientId: RawWorkspaceCredential = { ...S2S, client_id: undefined };
        const { sdkClient } = makeSdkClient(listing(noClientId, API_KEY));

        await expect(makeCredentials(sdkClient).getWorkspaceCredential()).resolves.toEqual({
            clientId: 'apikey-client-id',
            name: 'demo-builder-api-mesh',
            source: 'apiKey',
        });
    });

    it('an S2S entry is matched by integration_type, not by flow_type', async () => {
        const entpFlowOnly: RawWorkspaceCredential = {
            ...API_KEY,
            flow_type: 'entp',
            integration_type: 'jwt',
        };
        const { sdkClient } = makeSdkClient(listing(entpFlowOnly));

        await expect(makeCredentials(sdkClient).getWorkspaceCredential()).resolves.toEqual(
            expect.objectContaining({ source: 'apiKey' })
        );
    });

    it('answers nothing when no entry carries a client_id', async () => {
        const { sdkClient } = makeSdkClient(
            listing({ ...S2S, client_id: undefined }, { ...API_KEY, client_id: undefined })
        );

        await expect(makeCredentials(sdkClient).getWorkspaceCredential()).resolves.toBeUndefined();
    });

    it.each([
        ['nothing at all', undefined],
        ['a body-less answer', {}],
        ['a body that is not a list', { body: { client_id: 'x' } }],
    ])('a list that answers %s means no credential', async (_what, answer) => {
        const { sdkClient } = makeSdkClient({
            getCredentials: jest.fn().mockResolvedValue(answer),
        });

        await expect(makeCredentials(sdkClient).getWorkspaceCredential()).resolves.toBeUndefined();
    });

    it('a list call that throws means no credential, never a rejection', async () => {
        const { sdkClient } = makeSdkClient({
            getCredentials: jest.fn().mockRejectedValue(new Error('403 Forbidden')),
        });

        await expect(makeCredentials(sdkClient).getWorkspaceCredential()).resolves.toBeUndefined();
    });
});

describe('getWorkspaceCredential — when the SDK is never asked', () => {
    it.each([
        ['organization', { org: undefined }],
        ['project', { project: undefined }],
        ['workspace', { workspace: undefined }],
    ])('no cached %s: answers nothing without listing', async (_which, gap) => {
        const { client, sdkClient } = makeSdkClient(listing(S2S));

        await expect(
            makeCredentials(sdkClient, makeCacheManager(gap)).getWorkspaceCredential()
        ).resolves.toBeUndefined();
        expect(client.getCredentials).not.toHaveBeenCalled();
    });

    it('an SDK that stays uninitialized after ensureInitialized: answers nothing without listing', async () => {
        const fake = makeSdkClient(listing(S2S));
        fake.isInitialized.mockReturnValue(false);

        await expect(makeCredentials(fake.sdkClient).getWorkspaceCredential()).resolves.toBeUndefined();
        expect(fake.ensureInitialized).toHaveBeenCalledTimes(1);
        expect(fake.client.getCredentials).not.toHaveBeenCalled();
    });
});

describe('createWorkspaceCredential — the create call and its cache', () => {
    it('creates on the CACHED selection with the given name and description', async () => {
        const { client, sdkClient } = makeSdkClient();

        await makeCredentials(sdkClient).createWorkspaceCredential(NAME, DESCRIPTION);

        expect(client.createOAuthServerToServerCredential).toHaveBeenCalledWith(
            ORG,
            PROJ,
            WS,
            NAME,
            DESCRIPTION
        );
    });

    it('returns the created credential: apiKey as clientId, the name, S2S source', async () => {
        const { sdkClient } = makeSdkClient();

        await expect(
            makeCredentials(sdkClient).createWorkspaceCredential(NAME, DESCRIPTION)
        ).resolves.toEqual({
            clientId: 'client-id-abc',
            name: NAME,
            source: 'oauth_server_to_server',
        });
    });

    it('primes the read: the next getWorkspaceCredential answers from memory, not the SDK', async () => {
        const { client, sdkClient } = makeSdkClient(listing(API_KEY));
        const credentials = makeCredentials(sdkClient);

        const created = await credentials.createWorkspaceCredential(NAME, DESCRIPTION);

        await expect(credentials.getWorkspaceCredential()).resolves.toEqual(created);
        expect(client.getCredentials).not.toHaveBeenCalled();
    });

    it.each([
        ['nothing at all', undefined],
        ['a body-less answer', {}],
        ['a body without apiKey', { body: { id: '1099001' } }],
    ])('a create that answers %s returns nothing and primes NO cache', async (_what, answer) => {
        const { client, sdkClient } = makeSdkClient({
            ...listing(API_KEY),
            createOAuthServerToServerCredential: jest.fn().mockResolvedValue(answer),
        });
        const credentials = makeCredentials(sdkClient);

        await expect(credentials.createWorkspaceCredential(NAME, DESCRIPTION)).resolves.toBeUndefined();

        // A failed create must not leave a half-built credential in memory.
        await expect(credentials.getWorkspaceCredential()).resolves.toEqual(
            expect.objectContaining({ clientId: 'apikey-client-id' })
        );
        expect(client.getCredentials).toHaveBeenCalledTimes(1);
    });
});

describe('createWorkspaceCredential — a create that fails', () => {
    it.each([['409 Duplicate application name'], ['Conflict: already exists']])(
        'an already-exists failure (%s) answers with the EXISTING credential',
        async (message) => {
            const { client, sdkClient } = makeSdkClient({
                ...listing(S2S),
                createOAuthServerToServerCredential: jest.fn().mockRejectedValue(new Error(message)),
            });

            await expect(
                makeCredentials(sdkClient).createWorkspaceCredential(NAME, DESCRIPTION)
            ).resolves.toEqual(expect.objectContaining({ clientId: 's2s-client-id' }));
            expect(client.getCredentials).toHaveBeenCalledWith(ORG, PROJ, WS);
        }
    );

    it('any other failure answers nothing and does NOT go looking for an existing one', async () => {
        const { client, sdkClient } = makeSdkClient({
            ...listing(S2S),
            createOAuthServerToServerCredential: jest
                .fn()
                .mockRejectedValue(new Error('500 Internal Server Error')),
        });

        await expect(
            makeCredentials(sdkClient).createWorkspaceCredential(NAME, DESCRIPTION)
        ).resolves.toBeUndefined();
        expect(client.getCredentials).not.toHaveBeenCalled();
    });

    it('a failure with no message at all is still swallowed, never rethrown', async () => {
        const { sdkClient } = makeSdkClient({
            createOAuthServerToServerCredential: jest.fn().mockRejectedValue({}),
        });

        await expect(
            makeCredentials(sdkClient).createWorkspaceCredential(NAME, DESCRIPTION)
        ).resolves.toBeUndefined();
    });
});

describe('createWorkspaceCredential — when the SDK is never asked', () => {
    it.each([
        ['an empty name', '', DESCRIPTION],
        ['a name over 200 chars', 'n'.repeat(201), DESCRIPTION],
        ['a description over 500 chars', NAME, 'd'.repeat(501)],
    ])('%s is refused before any SDK call', async (_what, name, description) => {
        const { client, sdkClient } = makeSdkClient();

        await expect(
            makeCredentials(sdkClient).createWorkspaceCredential(name, description)
        ).resolves.toBeUndefined();
        expect(client.createOAuthServerToServerCredential).not.toHaveBeenCalled();
    });

    it('a 200-char name and a 500-char description are the longest accepted', async () => {
        const { client, sdkClient } = makeSdkClient();

        await makeCredentials(sdkClient).createWorkspaceCredential('n'.repeat(200), 'd'.repeat(500));

        expect(client.createOAuthServerToServerCredential).toHaveBeenCalledWith(
            ORG,
            PROJ,
            WS,
            'n'.repeat(200),
            'd'.repeat(500)
        );
    });

    it.each([
        ['organization', { org: undefined }],
        ['project', { project: undefined }],
        ['workspace', { workspace: undefined }],
    ])('no cached %s: answers nothing without creating', async (_which, gap) => {
        const { client, sdkClient } = makeSdkClient();

        await expect(
            makeCredentials(sdkClient, makeCacheManager(gap)).createWorkspaceCredential(
                NAME,
                DESCRIPTION
            )
        ).resolves.toBeUndefined();
        expect(client.createOAuthServerToServerCredential).not.toHaveBeenCalled();
    });

    it('an SDK that stays uninitialized after ensureInitialized: answers nothing without creating', async () => {
        const fake = makeSdkClient();
        fake.isInitialized.mockReturnValue(false);

        await expect(
            makeCredentials(fake.sdkClient).createWorkspaceCredential(NAME, DESCRIPTION)
        ).resolves.toBeUndefined();
        expect(fake.ensureInitialized).toHaveBeenCalledTimes(1);
        expect(fake.client.createOAuthServerToServerCredential).not.toHaveBeenCalled();
    });
});
