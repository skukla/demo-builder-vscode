/**
 * Master marker write-side contract (buildMasterMarker / serializeMasterMarker) and
 * a round-trip guarantee that what the starter writes is exactly what the joiner's
 * resolveJoinLink reads back.
 */

import {
    buildMasterMarker,
    serializeMasterMarker,
    writeMasterMarker,
    type MasterFileWriter,
    resolveJoinLink,
    MASTER_MARKER_PATH,
} from '@/features/project-creation/services/resolveJoinLink';

describe('buildMasterMarker', () => {
    it('builds a marker with packageId + commerce coords', () => {
        const marker = buildMasterMarker('citisignal', { endpoint: 'https://x/graphql', storeViewCode: 'citisignal_us' });
        expect(marker).toEqual({
            packageId: 'citisignal',
            commerce: { endpoint: 'https://x/graphql', storeViewCode: 'citisignal_us' },
        });
    });

    it('omits the commerce key when no coords are given', () => {
        expect(buildMasterMarker('citisignal')).toEqual({ packageId: 'citisignal' });
    });
});

describe('serializeMasterMarker', () => {
    it('produces parseable JSON', () => {
        const json = serializeMasterMarker(buildMasterMarker('citisignal', { endpoint: 'https://x/graphql' }));
        expect(() => JSON.parse(json)).not.toThrow();
        expect(JSON.parse(json).packageId).toBe('citisignal');
    });
});

describe('marker round-trip (write → read)', () => {
    it('resolveJoinLink reads back exactly what the starter wrote', async () => {
        const content = serializeMasterMarker(
            buildMasterMarker('citisignal', { endpoint: 'https://x/graphql', storeViewCode: 'citisignal_us' }),
        );
        // The reader is asked for the marker at MASTER_MARKER_PATH; return the written content.
        const readFile = jest.fn().mockImplementation(async (_o: string, _r: string, path: string) =>
            path === MASTER_MARKER_PATH ? content : null,
        );

        const result = await resolveJoinLink('https://github.com/commerce-sc/citisignal-master', readFile);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.descriptor.upstream).toEqual({ owner: 'commerce-sc', repo: 'citisignal-master' });
        expect(result.descriptor.packageId).toBe('citisignal');
        expect(result.descriptor.commerce).toEqual({ endpoint: 'https://x/graphql', storeViewCode: 'citisignal_us' });
    });
});

describe('writeMasterMarker', () => {
    it('writes the serialized marker to MASTER_MARKER_PATH with a commit message', async () => {
        const writes: Array<{ owner: string; repo: string; path: string; content: string; message: string }> = [];
        const writeFile: MasterFileWriter = async (owner, repo, path, content, message) => {
            writes.push({ owner, repo, path, content, message });
        };

        await writeMasterMarker(
            { owner: 'commerce-sc', repo: 'citisignal-master', packageId: 'citisignal', commerce: { endpoint: 'https://x/graphql' } },
            writeFile,
        );

        expect(writes).toHaveLength(1);
        expect(writes[0].owner).toBe('commerce-sc');
        expect(writes[0].repo).toBe('citisignal-master');
        expect(writes[0].path).toBe(MASTER_MARKER_PATH);
        expect(writes[0].message.length).toBeGreaterThan(0);
        const parsed = JSON.parse(writes[0].content);
        expect(parsed.packageId).toBe('citisignal');
        expect(parsed.commerce.endpoint).toBe('https://x/graphql');
    });

    it('round-trips: a written marker resolves back to the same descriptor', async () => {
        let written = '';
        await writeMasterMarker(
            { owner: 'o', repo: 'r', packageId: 'citisignal', commerce: { endpoint: 'https://x/graphql' } },
            async (_o, _r, _p, content) => { written = content; },
        );
        const result = await resolveJoinLink('https://github.com/o/r', async (_o, _r, path) =>
            path === MASTER_MARKER_PATH ? written : null,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.descriptor.packageId).toBe('citisignal');
        expect(result.descriptor.commerce?.endpoint).toBe('https://x/graphql');
    });
});
