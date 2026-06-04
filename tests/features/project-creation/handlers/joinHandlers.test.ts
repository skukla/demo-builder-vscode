/**
 * handleResolveJoinLink — the message handler that bridges the Join UI's onResolve
 * to the resolveJoinLink service. The GitHub file reader is injected so the handler
 * is unit-testable; the command wires the real (token-backed) GitHubFileOperations
 * reader.
 */

import {
    handleResolveJoinLink,
    createPublicMasterReader,
    type FetchLike,
} from '@/features/project-creation/handlers/joinHandlers';
import { buildMasterMarker, serializeMasterMarker } from '@/features/project-creation/services/resolveJoinLink';

const fakeFetch = (status: number, body = ''): { fetch: FetchLike; url: () => string } => {
    let captured = '';
    const fetch: FetchLike = async (u: string) => {
        captured = u;
        return { ok: status >= 200 && status < 300, status, text: async () => body };
    };
    return { fetch, url: () => captured };
};

const marker = serializeMasterMarker(buildMasterMarker('citisignal', { endpoint: 'https://x/graphql' }));
const link = 'https://github.com/commerce-sc/citisignal-master';

describe('handleResolveJoinLink', () => {
    it('errors on a missing link without reading anything', async () => {
        const readFile = jest.fn();
        const result = await handleResolveJoinLink(undefined, { readFile });
        expect(result.ok).toBe(false);
        expect(readFile).not.toHaveBeenCalled();
    });

    it('errors on a blank/whitespace link', async () => {
        const readFile = jest.fn();
        const result = await handleResolveJoinLink({ link: '   ' }, { readFile });
        expect(result.ok).toBe(false);
        expect(readFile).not.toHaveBeenCalled();
    });

    it('delegates to resolveJoinLink with the injected reader and returns the descriptor', async () => {
        const readFile = jest.fn().mockResolvedValue(marker);
        const result = await handleResolveJoinLink({ link }, { readFile });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.descriptor.upstream).toEqual({ owner: 'commerce-sc', repo: 'citisignal-master' });
        expect(result.descriptor.packageId).toBe('citisignal');
    });

    it('propagates a not-shareable failure when the marker is missing', async () => {
        const readFile = jest.fn().mockResolvedValue(null);
        const result = await handleResolveJoinLink({ link }, { readFile });
        expect(result.ok).toBe(false);
    });
});

describe('createPublicMasterReader (unauthenticated public read)', () => {
    it('reads file text from the public raw URL on 200', async () => {
        const f = fakeFetch(200, marker);
        const read = createPublicMasterReader(f.fetch);
        const content = await read('commerce-sc', 'citisignal-master', 'storefront-share.json');
        expect(content).toBe(marker);
        expect(f.url()).toBe('https://raw.githubusercontent.com/commerce-sc/citisignal-master/HEAD/storefront-share.json');
    });

    it('returns null on 404 (file absent / not a shareable storefront)', async () => {
        const read = createPublicMasterReader(fakeFetch(404).fetch);
        expect(await read('o', 'r', 'p')).toBeNull();
    });

    it('throws on other HTTP errors', async () => {
        const read = createPublicMasterReader(fakeFetch(500).fetch);
        await expect(read('o', 'r', 'p')).rejects.toThrow();
    });
});
