/**
 * resolveJoinLink — the heart of the content-SC "Join a shared storefront" flow.
 *
 * With a public master, joining is a single paste of a link. This service turns
 * that link into a typed JoinDescriptor by reading the master's self-describing
 * marker (which the starter writes). It takes an injected file reader so it can be
 * unit-tested without GitHub (and so the handler can wire the public, no-auth
 * GitHubFileOperations read).
 */

import {
    resolveJoinLink,
    MASTER_MARKER_PATH,
    type MasterFileReader,
} from '@/features/project-creation/services/resolveJoinLink';

const marker = JSON.stringify({
    packageId: 'citisignal',
    commerce: {
        endpoint: 'https://example.commerce/graphql',
        websiteCode: 'citisignal',
        storeCode: 'citisignal_store',
        storeViewCode: 'citisignal_us',
    },
});

const link = 'https://github.com/commerce-sc/citisignal-master';

describe('resolveJoinLink', () => {
    it('resolves a public master link + marker into a JoinDescriptor', async () => {
        const readFile: MasterFileReader = jest.fn().mockResolvedValue(marker);

        const result = await resolveJoinLink(link, readFile);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.descriptor.upstream).toEqual({ owner: 'commerce-sc', repo: 'citisignal-master' });
        expect(result.descriptor.packageId).toBe('citisignal');
        expect(result.descriptor.commerce?.endpoint).toBe('https://example.commerce/graphql');
        expect(result.descriptor.commerce?.storeViewCode).toBe('citisignal_us');
    });

    it('reads the marker from the parsed owner/repo at the expected path', async () => {
        const readFile = jest.fn().mockResolvedValue(marker);

        await resolveJoinLink(link, readFile);

        expect(readFile).toHaveBeenCalledWith('commerce-sc', 'citisignal-master', MASTER_MARKER_PATH);
    });

    it('handles a .git suffix in the link', async () => {
        const readFile = jest.fn().mockResolvedValue(marker);
        const result = await resolveJoinLink('https://github.com/commerce-sc/citisignal-master.git', readFile);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.descriptor.upstream.repo).toBe('citisignal-master');
    });

    it('fails gracefully when the marker is missing (not a shareable storefront)', async () => {
        const readFile: MasterFileReader = jest.fn().mockResolvedValue(null);
        const result = await resolveJoinLink(link, readFile);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/shareable|marker|storefront/i);
    });

    it('fails gracefully on malformed marker JSON', async () => {
        const readFile: MasterFileReader = jest.fn().mockResolvedValue('{ not json');
        const result = await resolveJoinLink(link, readFile);
        expect(result.ok).toBe(false);
    });

    it('fails when the marker has no packageId', async () => {
        const readFile: MasterFileReader = jest.fn().mockResolvedValue(JSON.stringify({ commerce: {} }));
        const result = await resolveJoinLink(link, readFile);
        expect(result.ok).toBe(false);
    });

    it('rejects a non-GitHub link without reading anything', async () => {
        const readFile = jest.fn();
        const result = await resolveJoinLink('https://example.com/not/github', readFile);
        expect(result.ok).toBe(false);
        expect(readFile).not.toHaveBeenCalled();
    });

    it('drops non-string commerce coords from an untrusted marker', async () => {
        const readFile: MasterFileReader = jest.fn().mockResolvedValue(JSON.stringify({
            packageId: 'citisignal',
            commerce: { endpoint: { nested: true }, websiteCode: 42, storeViewCode: 'citisignal_us' },
        }));
        const result = await resolveJoinLink(link, readFile);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.descriptor.commerce).toEqual({ storeViewCode: 'citisignal_us' });
        }
    });
});
