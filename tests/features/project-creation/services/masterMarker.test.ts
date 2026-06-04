/**
 * Master marker write-side contract (buildMasterMarker / serializeMasterMarker) and
 * a round-trip guarantee that what the starter writes is exactly what the joiner's
 * resolveJoinLink reads back.
 */

import {
    buildMasterMarker,
    serializeMasterMarker,
    writeMasterMarker,
    publishMasterMarkerForProject,
    type MasterFileWriter,
    resolveJoinLink,
    MASTER_MARKER_PATH,
} from '@/features/project-creation/services/resolveJoinLink';
import type { Project } from '@/types/base';

const makeProject = (over: Partial<Project>): Project => ({
    name: 'demo',
    created: new Date(),
    lastModified: new Date(),
    path: '/x',
    status: 'created' as Project['status'],
    ...over,
});

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

describe('publishMasterMarkerForProject', () => {
    it('builds + writes a marker from the project package + componentConfigs coords', async () => {
        const writes: Array<{ path: string; content: string }> = [];
        const writeFile: MasterFileWriter = async (_o, _r, path, content) => { writes.push({ path, content }); };

        const ok = await publishMasterMarkerForProject(
            {
                owner: 'me',
                repo: 'citisignal',
                project: makeProject({
                    selectedPackage: 'citisignal',
                    componentConfigs: {
                        'adobe-commerce-accs': {
                            ACCS_GRAPHQL_ENDPOINT: 'https://x/graphql',
                            ACCS_WEBSITE_CODE: 'citisignal',
                            ACCS_STORE_CODE: 'citisignal_store',
                            ACCS_STORE_VIEW_CODE: 'citisignal_us',
                        },
                    },
                }),
            },
            writeFile,
        );

        expect(ok).toBe(true);
        expect(writes).toHaveLength(1);
        expect(writes[0].path).toBe(MASTER_MARKER_PATH);
        const parsed = JSON.parse(writes[0].content);
        expect(parsed.packageId).toBe('citisignal');
        expect(parsed.commerce).toEqual({
            endpoint: 'https://x/graphql',
            websiteCode: 'citisignal',
            storeCode: 'citisignal_store',
            storeViewCode: 'citisignal_us',
        });
    });

    it('does not confuse STORE_CODE with STORE_VIEW_CODE', async () => {
        let written = '';
        await publishMasterMarkerForProject(
            { owner: 'o', repo: 'r', project: makeProject({ selectedPackage: 'b', componentConfigs: { x: { PAAS_STORE_CODE: 'main', PAAS_STORE_VIEW_CODE: 'default' } } }) },
            async (_o, _r, _p, content) => { written = content; },
        );
        const c = JSON.parse(written).commerce;
        expect(c.storeCode).toBe('main');
        expect(c.storeViewCode).toBe('default');
    });

    it('returns false (no write) when the project has no package', async () => {
        const writeFile = jest.fn();
        const ok = await publishMasterMarkerForProject({ owner: 'me', repo: 'r', project: makeProject({}) }, writeFile);
        expect(ok).toBe(false);
        expect(writeFile).not.toHaveBeenCalled();
    });
});
