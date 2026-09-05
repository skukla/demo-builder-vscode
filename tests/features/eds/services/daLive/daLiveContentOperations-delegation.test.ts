/**
 * DaLiveContentOperations — the wiring, not the work.
 *
 * This class holds no business logic: it constructs the six DA.live services
 * and forwards to them. That makes its one job the ARGUMENTS — which
 * collaborator, in which order, with which values — and it is the job a mocked
 * collaborator structurally cannot check for you, because a mock answers the
 * same whatever it is handed. Two neighbouring facade methods here take
 * `(org, site, path)` and `(srcOrg, srcSite, destOrg, destSite)`; a transposed
 * pair typechecks perfectly and deletes the wrong site.
 *
 * On 2026-09-05 ten of these bodies could be emptied whole with the entire
 * daLive suite still green — nothing called them at all.
 */

import {
    mockFetch,
    createContentOperationsHarness,
} from './daLiveContentOperations.testUtils';
import {
    DaLiveContentOperations,
    type DaLiveContentSource,
} from '@/features/eds/services/daLive/daLiveContentOperations';
import type { DaLiveBlockLibraryOperations } from '@/features/eds/services/daLive/daLiveBlockLibraryOperations';
import type { DaLiveConfigOperations } from '@/features/eds/services/daLive/daLiveConfigOperations';
import type { DaLiveContentCopy } from '@/features/eds/services/daLive/daLiveContentCopy';
import type { DaLiveContentDiscovery } from '@/features/eds/services/daLive/daLiveContentDiscovery';
import type { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';

global.fetch = mockFetch;

/** The six wired services, reached the way the sibling suites reach them. */
interface Internals {
    sourceOps: DaLiveSourceOperations;
    configOps: DaLiveConfigOperations;
    discoveryOps: DaLiveContentDiscovery;
    copyOps: DaLiveContentCopy;
    blockLibOps: DaLiveBlockLibraryOperations;
}

describe('DaLiveContentOperations delegation', () => {
    let service: DaLiveContentOperations;
    let ops: Internals;

    beforeEach(() => {
        jest.restoreAllMocks();
        service = createContentOperationsHarness().service;
        ops = service as unknown as Internals;
    });

    it('listDirectory forwards org, site and path to the source service', async () => {
        const entries = [{ name: 'index', path: '/index.html', ext: 'html' }];
        const spy = jest.spyOn(ops.sourceOps, 'listDirectory').mockResolvedValue(entries);

        const result = await service.listDirectory('acme-org', 'acme-site', '/pages');

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site', '/pages');
        expect(result).toBe(entries);
    });

    it('createSource forwards the content and the overwrite options untouched', async () => {
        const written = { success: true, path: '/nav.html' };
        const spy = jest.spyOn(ops.sourceOps, 'createSource').mockResolvedValue(written);

        const result = await service.createSource(
            'acme-org',
            'acme-site',
            '/nav.html',
            '<main>nav</main>',
            { overwrite: true }
        );

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site', '/nav.html', '<main>nav</main>', {
            overwrite: true,
        });
        expect(result).toBe(written);
    });

    it('readSource passes the byte cap through', async () => {
        // The cap is the whole point of the method — without it a large document
        // is read into memory in full and the caller's `truncated` flag lies.
        const read = { status: 200, body: '<main/>', bytes: 4096, truncated: true };
        const spy = jest.spyOn(ops.sourceOps, 'readSource').mockResolvedValue(read);

        const result = await service.readSource('acme-org', 'acme-site', '/big.html', 1024);

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site', '/big.html', 1024);
        expect(result).toBe(read);
    });

    it('deleteSource forwards the path it was asked to delete', async () => {
        const deleted = { success: true };
        const spy = jest.spyOn(ops.sourceOps, 'deleteSource').mockResolvedValue(deleted);

        const result = await service.deleteSource('acme-org', 'acme-site', '/old.html');

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site', '/old.html');
        expect(result).toBe(deleted);
    });

    it('deleteSiteRoot forwards to the source service, not the copy service', async () => {
        const spy = jest.spyOn(ops.sourceOps, 'deleteSiteRoot').mockResolvedValue(undefined);

        await service.deleteSiteRoot('acme-org', 'acme-site');

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site');
    });

    it('copyDaLiveSite keeps source and destination on their own sides', async () => {
        // Four positional strings of the same type: the compiler cannot tell a
        // transposed pair from a correct one, and the wrong side copies over
        // the site being migrated FROM.
        const outcome = { success: true } as const;
        const spy = jest.spyOn(ops.copyOps, 'copyDaLiveSite').mockResolvedValue(outcome);

        const result = await service.copyDaLiveSite(
            'src-org',
            'legacy-content',
            'dest-org',
            'new-site'
        );

        expect(spy).toHaveBeenCalledWith('src-org', 'legacy-content', 'dest-org', 'new-site');
        expect(result).toBe(outcome);
    });

    it('upsertBlockDocPage forwards the block descriptor to the block-library service', async () => {
        const block = { id: 'hero', exampleHtml: '<div class="hero"></div>' };
        const spy = jest.spyOn(ops.blockLibOps, 'upsertBlockDocPage').mockResolvedValue('written');

        const result = await service.upsertBlockDocPage('acme-org', 'acme-site', block);

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site', block);
        expect(result).toBe('written');
    });

    it('getContentPathsFromDaLive asks the discovery service, not the CDN index', async () => {
        // The two discovery routes answer differently — the DA.live listing sees
        // fragment documents the CDN index leaves out — so which one is called
        // decides whether nav and footer get copied.
        const paths = ['/nav', '/footer'];
        const spy = jest
            .spyOn(ops.discoveryOps, 'getContentPathsFromDaLive')
            .mockResolvedValue(paths);
        const indexSpy = jest.spyOn(ops.discoveryOps, 'getContentPathsFromIndex');

        const result = await service.getContentPathsFromDaLive('acme-org', 'acme-site');

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site');
        expect(indexSpy).not.toHaveBeenCalled();
        expect(result).toBe(paths);
    });

    it('getContentPathsFromIndex forwards the whole content source', async () => {
        const source: DaLiveContentSource = {
            org: 'brand-org',
            site: 'brand-site',
            indexUrl: 'https://example.com/full-index.json',
        };
        const paths = ['/about'];
        const spy = jest.spyOn(ops.discoveryOps, 'getContentPathsFromIndex').mockResolvedValue(paths);

        const result = await service.getContentPathsFromIndex(source);

        expect(spy).toHaveBeenCalledWith(source);
        expect(result).toBe(paths);
    });

    it('readSiteConfigForDiagnostics forwards to the config service', async () => {
        const config = { 'aem.repositoryId': 'author-p1-e1.adobeaemcloud.com' };
        const spy = jest
            .spyOn(ops.configOps, 'readSiteConfigForDiagnostics')
            .mockResolvedValue(config);

        const result = await service.readSiteConfigForDiagnostics('acme-org', 'acme-site');

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site');
        expect(result).toBe(config);
    });

    it('applySiteConfig removes nothing when no removeKeys are given', async () => {
        // The default has to be an empty list, not undefined and not a
        // placeholder: the config service deletes every key it is handed.
        const spy = jest
            .spyOn(ops.configOps, 'applySiteConfig')
            .mockResolvedValue({ success: true });

        await service.applySiteConfig('acme-org', 'acme-site', { 'editor.path': '/editor' });

        expect(spy).toHaveBeenCalledWith(
            'acme-org',
            'acme-site',
            { 'editor.path': '/editor' },
            []
        );
    });

    it('applySiteConfig passes removeKeys through when they are given', async () => {
        const spy = jest
            .spyOn(ops.configOps, 'applySiteConfig')
            .mockResolvedValue({ success: true, removed: ['aem.repositoryId'] });

        const result = await service.applySiteConfig('acme-org', 'acme-site', {}, [
            'aem.repositoryId',
        ]);

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site', {}, ['aem.repositoryId']);
        expect(result).toEqual({ success: true, removed: ['aem.repositoryId'] });
    });
});
