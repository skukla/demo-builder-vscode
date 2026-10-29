/**
 * Our live code patches on any storefront (EDS-64): applied where the code each fixes is there
 * exactly once, every patch on one file together or none, nothing written twice.
 */

import { applyKnownPatches, knownPatchTargets } from '@/features/eds/services/patches/knownPatches';
import {
    HEADER_JS,
    HEADER_NAV_TOOLS,
    KNOWN_PATCHES,
    TEASER_IMPORT,
    TEASER_JS,
    TEASER_LINK,
} from '../../../../helpers/knownPatchFixtures';

const HEADER = HEADER_NAV_TOOLS.target;
const TEASER = TEASER_LINK.target;

function files(own: Record<string, string>): Map<string, string> {
    return new Map(Object.entries(own));
}

describe('applyKnownPatches', () => {
    it('applies every patch whose code is there, and names each one', () => {
        const result = applyKnownPatches(files({ [HEADER]: HEADER_JS, [TEASER]: TEASER_JS }), KNOWN_PATCHES);

        expect(result.applied).toStrictEqual([HEADER_NAV_TOOLS.id, TEASER_LINK.id, TEASER_IMPORT.id]);
        expect(result.files.get(HEADER)).toContain('if (!navTools) {');
        expect(result.files.get(TEASER)).toContain('getProductLink(urlKey, sku)');
        expect(result.files.get(TEASER)).not.toContain('rootLink');
    });

    it('writes nothing to code that already has the fixes', () => {
        const once = applyKnownPatches(files({ [HEADER]: HEADER_JS, [TEASER]: TEASER_JS }), KNOWN_PATCHES);

        const again = applyKnownPatches(once.files, KNOWN_PATCHES);

        expect(again.files.size).toBe(0);
        expect(again.applied).toStrictEqual([]);
    });

    it('leaves a file whose code is there twice: it cannot tell which the fix is for', () => {
        const twice = HEADER_JS + HEADER_JS;

        const result = applyKnownPatches(files({ [HEADER]: twice }), [HEADER_NAV_TOOLS]);

        expect(result.files.size).toBe(0);
    });

    it("applies none of a file's patches when one does not fit: the link never goes in without its import", () => {
        const editedImport = TEASER_JS.replace('  rootLink,\n', '  rootLink,\n  getProductLink,\n');

        const result = applyKnownPatches(files({ [TEASER]: editedImport }), KNOWN_PATCHES);

        expect(result.files.has(TEASER)).toBe(false);
        expect(result.applied).toStrictEqual([]);
    });

    it('applies the rest of a file once part of it is already in place', () => {
        const linkDone = TEASER_JS.replace('rootLink(`/products/${urlKey}/${sku}`)', 'getProductLink(urlKey, sku)');

        const result = applyKnownPatches(files({ [TEASER]: linkDone }), KNOWN_PATCHES);

        expect(result.applied).toStrictEqual([TEASER_IMPORT.id]);
        expect(result.files.get(TEASER)).not.toContain('rootLink');
    });

    it('skips a storefront that does not have the file', () => {
        expect(applyKnownPatches(files({}), KNOWN_PATCHES).files.size).toBe(0);
    });

    it('refuses a target the patch policy does not allow, whatever the ledger says', () => {
        const toPackage = { ...HEADER_NAV_TOOLS, target: 'package.json' };

        const result = applyKnownPatches(files({ 'package.json': HEADER_JS }), [toPackage]);

        expect(result.files.size).toBe(0);
    });

    it('keeps a `$&` in the ledger text literal', () => {
        const dollar = { ...HEADER_NAV_TOOLS, replacement: 'const price = "$&";' };

        const result = applyKnownPatches(files({ [HEADER]: HEADER_JS }), [dollar]);

        expect(result.files.get(HEADER)).toContain('const price = "$&";');
    });
});

describe('knownPatchTargets', () => {
    it('names each allowed file once', () => {
        expect(knownPatchTargets([...KNOWN_PATCHES, { ...HEADER_NAV_TOOLS, target: 'package.json' }])).toStrictEqual([
            HEADER,
            TEASER,
        ]);
    });
});
