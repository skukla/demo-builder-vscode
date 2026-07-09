/**
 * isManagedStorefrontFile tests
 *
 * The predicate decides whether a conflicted storefront file is one the EDS
 * pipeline authoritatively generates (config.json, fstab.yaml) — in which case
 * Sync Storefront may silently take the remote copy — or user content, which
 * must fall back to the manual merge flow. Conservative default: unknown → false.
 */

import { isManagedStorefrontFile } from '@/features/lifecycle/commands/managedStorefrontFiles';

describe('isManagedStorefrontFile', () => {
    it('treats root-level config.json as managed', () => {
        expect(isManagedStorefrontFile('config.json')).toBe(true);
    });

    it('treats root-level fstab.yaml as managed', () => {
        expect(isManagedStorefrontFile('fstab.yaml')).toBe(true);
    });

    it('normalizes a leading slash', () => {
        expect(isManagedStorefrontFile('/config.json')).toBe(true);
    });

    it('does not treat a nested config.json as managed', () => {
        expect(isManagedStorefrontFile('blocks/config.json')).toBe(false);
    });

    it('does not treat user content (index.html) as managed', () => {
        expect(isManagedStorefrontFile('index.html')).toBe(false);
    });

    it('does not treat an unknown file as managed', () => {
        expect(isManagedStorefrontFile('some-random-file.txt')).toBe(false);
    });

    it('does not treat an empty path as managed', () => {
        expect(isManagedStorefrontFile('')).toBe(false);
    });
});
