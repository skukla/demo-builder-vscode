/**
 * Master marker write-side contract (buildMasterMarker / serializeMasterMarker) and
 * a round-trip guarantee that what the starter writes is exactly what the joiner's
 * resolveJoinLink reads back.
 */

import {
    buildMasterMarker,
    serializeMasterMarker,
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
