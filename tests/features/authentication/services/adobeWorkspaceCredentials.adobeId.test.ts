/**
 * `createAdobeIdCredential` — the AdobeID/apiKey credential API Mesh subscribes
 * with. List-first: an existing apiKey credential whose name is the requested
 * one or a legacy alias is reused by its `id_integration`; otherwise one is
 * created and the create response's id comes back (`id_integration` when the
 * response carries it, else `id` — Console's create answers in `.id`).
 *
 * The delegation through AdobeEntityFetcher is pinned in
 * `adobeEntityFetcher-apiServices.test.ts`; this suite pins the DECISIONS in
 * the matcher and the payload, against the module directly.
 */

import type {
    AdobeIdCredentialInput,
    RawWorkspaceCredential,
} from '@/features/authentication/services/types';
import { makeCredentials, makeSdkClient, ORG, PROJ, WS } from './adobeWorkspaceCredentials.testUtils';

const INPUT: AdobeIdCredentialInput = {
    name: 'demo-builder-api-mesh-45780697',
    description: 'API Mesh (Demo Builder)',
    platform: 'apiKey',
    domain: 'localhost:3000',
};
const LEGACY_NAME = 'demo-builder-api-mesh';

/** An apiKey list entry named `name`, overridable field by field. */
function apiKeyEntry(
    name: string | undefined,
    overrides: Partial<RawWorkspaceCredential> = {},
): RawWorkspaceCredential {
    return {
        integration_type: 'apikey',
        flow_type: 'adobeid',
        integration_name: name,
        client_id: 'apikey-client-id',
        id_integration: '1022842',
        ...overrides,
    };
}

function listing(...entries: RawWorkspaceCredential[]) {
    return { getCredentials: jest.fn().mockResolvedValue({ body: entries }) };
}

describe('createAdobeIdCredential — reuse', () => {
    it('lists the given org/project/workspace before deciding', async () => {
        const { client, sdkClient } = makeSdkClient();

        await makeCredentials(sdkClient).createAdobeIdCredential(ORG, PROJ, WS, INPUT);

        expect(client.getCredentials).toHaveBeenCalledWith(ORG, PROJ, WS);
    });

    it.each([
        ['integration_type apikey with no flow_type', { flow_type: undefined }],
        ['flow_type adobeid with another integration_type', { integration_type: 'other' }],
    ])('reuses an entry matched by %s', async (_how, shape) => {
        const { client, sdkClient } = makeSdkClient(listing(apiKeyEntry(INPUT.name, shape)));

        await expect(
            makeCredentials(sdkClient).createAdobeIdCredential(ORG, PROJ, WS, INPUT)
        ).resolves.toBe('1022842');
        expect(client.createAdobeIdCredential).not.toHaveBeenCalled();
    });

    it('reuses an entry named by a legacy alias, not only by the requested name', async () => {
        const { client, sdkClient } = makeSdkClient(listing(apiKeyEntry(LEGACY_NAME)));

        await expect(
            makeCredentials(sdkClient).createAdobeIdCredential(ORG, PROJ, WS, {
                ...INPUT,
                reuseNames: [LEGACY_NAME],
            })
        ).resolves.toBe('1022842');
        expect(client.createAdobeIdCredential).not.toHaveBeenCalled();
    });

    it.each([
        [
            'the right name but the S2S type',
            apiKeyEntry(INPUT.name, { integration_type: 'oauth_server_to_server', flow_type: 'entp' }),
        ],
        ['the right type but no name', apiKeyEntry(undefined)],
        ['the right type and name but no id_integration', apiKeyEntry(INPUT.name, { id_integration: undefined })],
        // Only the requested name and its declared aliases count — never another
        // credential's name, whatever it happens to be.
        ["another credential's name", apiKeyEntry('Stryker was here')],
        ['the legacy name when no alias was declared', apiKeyEntry(LEGACY_NAME)],
    ])('creates when the only entry has %s', async (_what, entry) => {
        const { client, sdkClient } = makeSdkClient(listing(entry));

        await expect(
            makeCredentials(sdkClient).createAdobeIdCredential(ORG, PROJ, WS, INPUT)
        ).resolves.toBe('created-int');
        expect(client.createAdobeIdCredential).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['nothing at all', undefined],
        ['a body-less answer', {}],
    ])('a list that answers %s means nothing to reuse: creates', async (_what, answer) => {
        const { client, sdkClient } = makeSdkClient({
            getCredentials: jest.fn().mockResolvedValue(answer),
        });

        await expect(
            makeCredentials(sdkClient).createAdobeIdCredential(ORG, PROJ, WS, INPUT)
        ).resolves.toBe('created-int');
        expect(client.createAdobeIdCredential).toHaveBeenCalledTimes(1);
    });
});

describe('createAdobeIdCredential — create', () => {
    it('sends the input WITHOUT the local reuseNames hint', async () => {
        const { client, sdkClient } = makeSdkClient();

        await makeCredentials(sdkClient).createAdobeIdCredential(ORG, PROJ, WS, {
            ...INPUT,
            reuseNames: [LEGACY_NAME],
        });

        expect(client.createAdobeIdCredential).toHaveBeenCalledWith(ORG, PROJ, WS, INPUT);
    });

    it('prefers id_integration over id when the create answer carries both', async () => {
        const { sdkClient } = makeSdkClient({
            createAdobeIdCredential: jest
                .fn()
                .mockResolvedValue({ body: { id_integration: 'int-1', id: 'raw-1' } }),
        });

        await expect(
            makeCredentials(sdkClient).createAdobeIdCredential(ORG, PROJ, WS, INPUT)
        ).resolves.toBe('int-1');
    });

    it.each([
        ['nothing at all', undefined],
        ['a body-less answer', {}],
        ['a body with neither id', { body: {} }],
    ])('a create that answers %s yields no id, not a crash', async (_what, answer) => {
        const { sdkClient } = makeSdkClient({
            createAdobeIdCredential: jest.fn().mockResolvedValue(answer),
        });

        await expect(
            makeCredentials(sdkClient).createAdobeIdCredential(ORG, PROJ, WS, INPUT)
        ).resolves.toBeUndefined();
    });
});
