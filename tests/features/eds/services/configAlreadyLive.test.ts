/**
 * configAlreadyLive — is this config.json already on GitHub AND served live?
 * (2026-10-15: a block-library Republish pushed and published an identical config
 * and waited for the edge, ~9s for nothing.)
 *
 * Asserted: true only when GitHub has the same text and the live site answers the
 * same JSON (formatting aside); false — sync as before — when either differs, the
 * site does not answer, or GitHub has none.
 */

import { configAlreadyLive } from '@/features/eds/services/configAlreadyLive';

const LOCAL = '{\n  "public": { "default": { "commerce-endpoint": "https://x/graphql" } }\n}';
const mockFetch = jest.fn();
global.fetch = mockFetch;

function serves(body: string, ok = true): void {
    mockFetch.mockResolvedValue({ ok, text: jest.fn().mockResolvedValue(body) });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('configAlreadyLive', () => {
    it('is true when GitHub has the same text and the live site serves the same JSON', async () => {
        serves('{"public":{"default":{"commerce-endpoint":"https://x/graphql"}}}');

        await expect(configAlreadyLive(LOCAL, { content: LOCAL }, 'me', 'shop')).resolves.toBe(true);
        expect(mockFetch).toHaveBeenCalledWith('https://main--shop--me.aem.live/config.json', expect.anything());
    });

    it('is false when the live site serves something else — a CDN left stale', async () => {
        serves('{"public":{"default":{"commerce-endpoint":"https://old/graphql"}}}');

        await expect(configAlreadyLive(LOCAL, { content: LOCAL }, 'me', 'shop')).resolves.toBe(false);
    });

    it('is false, asking the site nothing, when GitHub has other text or none', async () => {
        await expect(configAlreadyLive(LOCAL, { content: '{}' }, 'me', 'shop')).resolves.toBe(false);
        await expect(configAlreadyLive(LOCAL, null, 'me', 'shop')).resolves.toBe(false);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('is false when the site does not answer, or answers an error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('offline'));
        await expect(configAlreadyLive(LOCAL, { content: LOCAL }, 'me', 'shop')).resolves.toBe(false);

        serves(LOCAL, false);
        await expect(configAlreadyLive(LOCAL, { content: LOCAL }, 'me', 'shop')).resolves.toBe(false);
    });
});
