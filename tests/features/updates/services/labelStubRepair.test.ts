/**
 * An update repairs the label files Demo Builder's stub overwrote (2026-10-22).
 *
 * Storefronts made before the creation fix hold our one-row stub at
 * `placeholders/checkout.json`, where the B2B template ships the two labels its checkout
 * block reads with no fallback; their heading and Edit link read "undefined" (measured on
 * JustRite). An update puts the template's rows back, read at the commit the update brings
 * the storefront to. A label file that is not our stub is the SC's or a colleague's, and is
 * never touched.
 */

import { buildPlaceholderStubJson } from '@/features/eds/services/placeholderStubs';
import { labelsPutBack, repairStubbedLabelFiles } from '@/features/updates/services/labelStubRepair';
import {
    B2B_TEMPLATE_CHECKOUT_JSON,
    B2B_TEMPLATE_CHECKOUT_ROWS,
    OLD_SINGLE_SHEET_STUB_JSON,
} from '../../../helpers/placeholderLabelFixtures';

const CHECKOUT = 'placeholders/checkout.json';

/** A storefront and a template, each a path → content map; writes land in `written`. */
function access(storefront: Record<string, string>, template: Record<string, string>) {
    const written = new Map<string, string>();
    return {
        written,
        files: {
            readStorefront: async (path: string): Promise<string | undefined> => storefront[path],
            readTemplate: async (path: string): Promise<string | undefined> => template[path],
            write: async (path: string, content: string): Promise<void> => {
                written.set(path, content);
            },
        },
    };
}

const rowsOf = (content: string | undefined): unknown =>
    (JSON.parse(content ?? 'null') as { data: { data: unknown } }).data.data;

describe('repairStubbedLabelFiles', () => {
    it.each([
        ['our older single-sheet stub', OLD_SINGLE_SHEET_STUB_JSON],
        ['our current stub', buildPlaceholderStubJson()],
    ])("replaces %s with the template's checkout labels", async (_name, stub) => {
        const { files, written } = access({ [CHECKOUT]: stub }, { [CHECKOUT]: B2B_TEMPLATE_CHECKOUT_JSON });

        const repaired = await repairStubbedLabelFiles(files);

        expect(repaired).toStrictEqual([CHECKOUT]);
        expect(rowsOf(written.get(CHECKOUT))).toStrictEqual(B2B_TEMPLATE_CHECKOUT_ROWS);
        expect(written.get(CHECKOUT)).not.toContain('_stub');
    });

    it("never touches a label file the SC or a colleague wrote, even where the template has one", async () => {
        const own = JSON.stringify({ data: [{ Key: 'Checkout.Summary.heading', Value: 'Basket ({count})' }] });
        const { files, written } = access({ [CHECKOUT]: own }, { [CHECKOUT]: B2B_TEMPLATE_CHECKOUT_JSON });

        expect(await repairStubbedLabelFiles(files)).toStrictEqual([]);
        expect(written.size).toBe(0);
    });

    it('leaves a stub alone where the template ships no labels for that area', async () => {
        const { files, written } = access(
            { 'placeholders/cart.json': OLD_SINGLE_SHEET_STUB_JSON, [CHECKOUT]: OLD_SINGLE_SHEET_STUB_JSON },
            { [CHECKOUT]: B2B_TEMPLATE_CHECKOUT_JSON },
        );

        expect(await repairStubbedLabelFiles(files)).toStrictEqual([CHECKOUT]);
        // Control: the area the template has a file for was written; the cart was not.
        expect([...written.keys()]).toStrictEqual([CHECKOUT]);
    });

    it("leaves a stub alone where the template's own file is a stub too (a colleague's storefront)", async () => {
        const { files, written } = access({ [CHECKOUT]: OLD_SINGLE_SHEET_STUB_JSON }, { [CHECKOUT]: OLD_SINGLE_SHEET_STUB_JSON });

        expect(await repairStubbedLabelFiles(files)).toStrictEqual([]);
        expect(written.size).toBe(0);
    });

    it('creates nothing where the storefront has no label file', async () => {
        const { files, written } = access({}, { [CHECKOUT]: B2B_TEMPLATE_CHECKOUT_JSON });

        expect(await repairStubbedLabelFiles(files)).toStrictEqual([]);
        expect(written.size).toBe(0);
    });
});

describe('labelsPutBack', () => {
    // Under the project's own heading, in the SC's words: no project name, no file path
    // (owner, 2026-10-22).
    it('says which pages had their labels fixed, in one line, in the SC\'s words', () => {
        expect(labelsPutBack([CHECKOUT])).toStrictEqual(["Fixed the checkout page's labels."]);
    });

    it('names each page when several were fixed', () => {
        expect(labelsPutBack([CHECKOUT, 'placeholders/payment-services.json'])).toStrictEqual([
            'Fixed the labels of the checkout and payment services pages.',
        ]);
    });

    it('says nothing when nothing was put back', () => {
        expect(labelsPutBack([])).toStrictEqual([]);
    });
});
