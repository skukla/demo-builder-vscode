/**
 * handleResolveJoinLink — the message handler that bridges the Join UI's onResolve
 * to the resolveJoinLink service. The GitHub file reader is injected so the handler
 * is unit-testable; the command wires the real (token-backed) GitHubFileOperations
 * reader.
 */

import { handleResolveJoinLink } from '@/features/project-creation/handlers/joinHandlers';
import { buildMasterMarker, serializeMasterMarker } from '@/features/project-creation/services/resolveJoinLink';

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
