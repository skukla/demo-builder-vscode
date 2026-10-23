/**
 * Undoing a retired code patch (EDS-62).
 *
 * The patches repo lists a patch it retired with the same fields it had, so taking it back out
 * is the apply run backwards: the `replacement` text becomes the `precondition` text again. It
 * is only ever done where the file holds the replacement verbatim, exactly once; anything else
 * is the SC's own code, and is left as it is. The fixtures are the two real retired entries.
 */

import { retiredTargets, undoRetiredPatches } from '@/features/eds/services/patches/retiredPatches';
import {
    COMMERCE_JS_CANONICAL,
    COMMERCE_JS_RETIRED_APPLIED,
    RETIRED_PATCHES,
    RETIRED_SKU_ENCODING,
    RETIRED_SKU_LINK,
} from '../../../../helpers/retiredPatchFixtures';

const COMMERCE = 'scripts/commerce.js';

describe('undoRetiredPatches', () => {
    it('puts the original code back where the retired fix is in place', () => {
        const result = undoRetiredPatches(new Map([[COMMERCE, COMMERCE_JS_RETIRED_APPLIED]]), RETIRED_PATCHES);

        expect(result.files.get(COMMERCE)).toBe(COMMERCE_JS_CANONICAL);
        expect(result.undone).toStrictEqual(['product-link-sku-encoding', 'product-link-sku-slash-encoding']);
        expect(result.skipped).toStrictEqual([]);
    });

    it('leaves a file without the retired fix untouched, and answers no files', () => {
        const result = undoRetiredPatches(new Map([[COMMERCE, COMMERCE_JS_CANONICAL]]), RETIRED_PATCHES);

        expect(result.files.size).toBe(0);
        expect(result.undone).toStrictEqual([]);
    });

    it('still undoes the fix when the code around it was edited, as long as the fix itself is intact', () => {
        const edited = `// my own note\n${COMMERCE_JS_RETIRED_APPLIED.replace('loadCommerce() {}', 'loadCommerce() { init(); }')}`;

        const result = undoRetiredPatches(new Map([[COMMERCE, edited]]), RETIRED_PATCHES);

        const after = result.files.get(COMMERCE)!;
        expect(after).toContain(RETIRED_SKU_ENCODING.precondition);
        expect(after).toContain(RETIRED_SKU_LINK.precondition);
        expect(after).not.toContain('encodeSkuForUrl');
        expect(after.startsWith('// my own note\n')).toBe(true);
        expect(after).toContain('loadCommerce() { init(); }');
    });

    it('leaves a fix the SC edited inside: only the verbatim block is ever taken out', () => {
        const touched = COMMERCE_JS_RETIRED_APPLIED.replace(
            "const sanitizedSku = sku ? encodeSkuForUrl(sku) : '';",
            "const sanitizedSku = sku ? encodeSkuForUrl(sku).toUpperCase() : '';",
        );

        const result = undoRetiredPatches(new Map([[COMMERCE, touched]]), [RETIRED_SKU_LINK]);

        expect(result.files.size).toBe(0);
        expect(result.undone).toStrictEqual([]);
    });

    it('takes out none of a fix retired together when the SC edited part of it', () => {
        // The link calls the helper; taking the helper out under an edited link breaks every link.
        const touched = COMMERCE_JS_RETIRED_APPLIED.replace(
            "const sanitizedSku = sku ? encodeSkuForUrl(sku) : '';",
            "const sanitizedSku = sku ? encodeSkuForUrl(sku).toUpperCase() : '';",
        );

        const result = undoRetiredPatches(new Map([[COMMERCE, touched]]), RETIRED_PATCHES);

        expect(result.files.size).toBe(0);
        expect(result.undone).toStrictEqual([]);
        expect(result.skipped).toStrictEqual([
            {
                patchId: 'product-link-sku-encoding',
                reason: 'Part of the same fix was changed, so none of it was taken out',
            },
            {
                patchId: 'product-link-sku-slash-encoding',
                reason: 'Part of the same fix was changed, so none of it was taken out',
            },
        ]);
    });

    it('skips a fix whose block appears more than once, since it cannot tell which one is ours', () => {
        const twice = `${COMMERCE_JS_RETIRED_APPLIED}\n${RETIRED_SKU_LINK.replacement}`;

        const result = undoRetiredPatches(new Map([[COMMERCE, twice]]), [RETIRED_SKU_LINK]);

        expect(result.files.size).toBe(0);
        expect(result.skipped).toStrictEqual([
            { patchId: 'product-link-sku-slash-encoding', reason: 'The fix appears more than once' },
        ]);
    });

    it('skips a target the patch policy refuses, even when it holds the text', () => {
        const outside = { ...RETIRED_SKU_LINK, id: 'outside', target: 'package.json' };

        const result = undoRetiredPatches(
            new Map([['package.json', RETIRED_SKU_LINK.replacement]]),
            [outside],
        );

        expect(result.files.size).toBe(0);
        expect(result.undone).toStrictEqual([]);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].patchId).toBe('outside');
        expect(result.skipped[0].reason).toMatch(/outside the permitted directories/);
    });

    it('reads a replacement holding $ patterns literally', () => {
        const dollars = { ...RETIRED_SKU_LINK, precondition: 'const a = 1;', replacement: "const a = `$&$'`;" };

        const result = undoRetiredPatches(new Map([[COMMERCE, "x\nconst a = `$&$'`;\ny"]]), [dollars]);

        expect(result.files.get(COMMERCE)).toBe('x\nconst a = 1;\ny');
    });
});

describe('retiredTargets', () => {
    it('names each file once, and never one the patch policy refuses', () => {
        const outside = { ...RETIRED_SKU_LINK, id: 'outside', target: '.github/workflows/x.yml' };

        expect(retiredTargets([...RETIRED_PATCHES, outside])).toStrictEqual([COMMERCE]);
    });
});
