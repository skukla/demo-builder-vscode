/**
 * stripRedundantDaLiveSite — the load-side half of the legacyLookupKey retirement
 * (2026-08-23).
 *
 * Since reset AND repair both migrate a mismatched DA.live site name before
 * registering, the DA site name equals the GitHub repo name on every healthy
 * project — so an equal `daLiveSite` in the manifest is dead weight, and readers
 * fall back to the repo name (`getEdsDaLiveTarget`, `extractRepublishParams`).
 *
 * An UNEQUAL `daLiveSite` is deliberately preserved: on an unmigrated legacy
 * project it is both the pointer to where the DA content actually lives and the
 * signal `findStorefrontNameMismatch` detects. Stripping it blanket-blind would
 * blind the migration net.
 */

import { stripRedundantDaLiveSite } from '@/core/state/projectFileLoader';
import type { Project } from '@/types/base';

function projectWith(metadata: Record<string, unknown> | undefined): Project {
    return {
        name: 'demo',
        path: '/p',
        componentInstances: metadata
            ? { 'eds-storefront': { id: 'eds-storefront', metadata } }
            : {},
    } as unknown as Project;
}

describe('stripRedundantDaLiveSite', () => {
    it('strips daLiveSite when it equals the GitHub repo name', () => {
        const project = projectWith({ githubRepo: 'me/shop', daLiveSite: 'shop' });

        stripRedundantDaLiveSite(project);

        const metadata = project.componentInstances?.['eds-storefront']?.metadata;
        expect(metadata).not.toHaveProperty('daLiveSite');
        expect(metadata?.githubRepo).toBe('me/shop');
    });

    it('preserves daLiveSite when it DIFFERS from the repo name (unmigrated legacy project)', () => {
        const project = projectWith({
            githubRepo: 'me/b2b-boilerplate',
            daLiveSite: 'b2b-boilerplate-content',
        });

        stripRedundantDaLiveSite(project);

        const metadata = project.componentInstances?.['eds-storefront']?.metadata;
        expect(metadata?.daLiveSite).toBe('b2b-boilerplate-content');
    });

    it('is a no-op when daLiveSite or githubRepo is absent', () => {
        const noSite = projectWith({ githubRepo: 'me/shop' });
        const noRepo = projectWith({ daLiveSite: 'shop' });

        stripRedundantDaLiveSite(noSite);
        stripRedundantDaLiveSite(noRepo);

        expect(noSite.componentInstances?.['eds-storefront']?.metadata?.githubRepo).toBe('me/shop');
        expect(noRepo.componentInstances?.['eds-storefront']?.metadata?.daLiveSite).toBe('shop');
    });

    it('is a no-op when there is no EDS storefront instance', () => {
        const project = projectWith(undefined);
        expect(() => stripRedundantDaLiveSite(project)).not.toThrow();
    });
});
