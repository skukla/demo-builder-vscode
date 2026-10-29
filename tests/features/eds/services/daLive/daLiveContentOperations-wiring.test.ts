/**
 * DaLiveContentOperations — the wiring, not the work.
 *
 * This class holds no business logic: it constructs the DA.live services and
 * hands them back as fields. Its forwarders were retired 2026-10-08 (EDS-8);
 * the two that remain (`copyDaLiveSite`, `deleteSiteRoot`) exist because
 * `MigrationContentOps` spans two services. Their one job is the ARGUMENTS —
 * which collaborator, in which order — and a mocked collaborator structurally
 * cannot check that for you: `(srcOrg, srcSite, destOrg, destSite)` transposed
 * typechecks perfectly and copies over the wrong site.
 */

import {
    mockFetch,
    createContentOperationsHarness,
} from './daLiveContentOperations.testUtils';
import { DaLiveBlockLibraryOperations } from '@/features/eds/services/daLive/daLiveBlockLibraryOperations';
import { DaLiveConfigOperations } from '@/features/eds/services/daLive/daLiveConfigOperations';
import type { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import { DaLiveContentCopy } from '@/features/eds/services/daLive/daLiveContentCopy';
import { DaLiveContentDiscovery } from '@/features/eds/services/daLive/daLiveContentDiscovery';
import { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';

global.fetch = mockFetch;

describe('DaLiveContentOperations wiring', () => {
    let service: DaLiveContentOperations;

    beforeEach(() => {
        jest.restoreAllMocks();
        service = createContentOperationsHarness().service;
    });

    it('hands back one wired instance of each DA.live service', () => {
        expect(service.sourceOps).toBeInstanceOf(DaLiveSourceOperations);
        expect(service.configOps).toBeInstanceOf(DaLiveConfigOperations);
        expect(service.discoveryOps).toBeInstanceOf(DaLiveContentDiscovery);
        expect(service.copyOps).toBeInstanceOf(DaLiveContentCopy);
        expect(service.blockLibOps).toBeInstanceOf(DaLiveBlockLibraryOperations);
    });

    it('deleteSiteRoot forwards to the source service, not the copy service', async () => {
        const spy = jest.spyOn(service.sourceOps, 'deleteSiteRoot').mockResolvedValue(undefined);

        await service.deleteSiteRoot('acme-org', 'acme-site');

        expect(spy).toHaveBeenCalledWith('acme-org', 'acme-site');
    });

    it('copyDaLiveSite keeps source and destination on their own sides', async () => {
        // Four positional strings of the same type: the compiler cannot tell a
        // transposed pair from a correct one, and the wrong side copies over
        // the site being migrated FROM.
        const outcome = { success: true } as const;
        const spy = jest.spyOn(service.copyOps, 'copyDaLiveSite').mockResolvedValue(outcome);

        const result = await service.copyDaLiveSite(
            'src-org',
            'legacy-content',
            'dest-org',
            'new-site'
        );

        expect(spy).toHaveBeenCalledWith('src-org', 'legacy-content', 'dest-org', 'new-site');
        expect(result).toBe(outcome);
    });
});
