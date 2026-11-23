/**
 * Failure words an SC can read (release walk F221, owner 2026-11-17): what Commerce said, or why an
 * install stopped, in plain words, never an API route, a status code or a code-shaped name. Raw text
 * stays for Debug Logs and the agent tools; only these words reach a screen.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { plainFailure } from '@/features/data-installer/plainFailure';
import { plain } from '@/core/utils/plainText';
import { plainRefusedRemovals, plainRowNote, plainSkipped } from '@/features/data-installer/plainRows';
import type { SkippedRowRecord } from '@/features/data-installer/types';

const answered = (status: number, route: string, body: object | string): CommerceReadError =>
    new CommerceReadError(
        `Commerce answered ${status} for ${route}: ${typeof body === 'string' ? body : JSON.stringify(body)}`,
        status
    );

describe('plainFailure: why an install stopped', () => {
    it('says Commerce stopped answering, and while what, with no route', () => {
        const error = new CommerceReadError('Commerce did not respond to V1/products: timed out');

        expect(plainFailure(error, { kind: 'products' })).toBe(
            'Commerce stopped answering while products were installing.'
        );
    });

    it('reads the same from the text a job record carries', () => {
        expect(
            plainFailure('Commerce did not respond to V1/categories: socket hang up', {
                kind: 'store_config',
            })
        ).toBe('Commerce stopped answering while store configuration was installing.');
    });

    it('says uninstalling for an uninstall', () => {
        expect(
            plainFailure('Commerce did not respond to products/x: timed out', {
                kind: 'products',
                work: 'uninstalling',
            })
        ).toBe('Commerce stopped answering while products were uninstalling.');
    });

    it.each([
        [503, 'Commerce ran into a problem while products were installing.'],
        [500, 'Commerce ran into a problem while products were installing.'],
        [429, 'Commerce was too busy to answer while products were installing.'],
        [401, "Commerce didn't accept the sign-in. Sign in to Adobe again."],
        [403, "Commerce didn't accept the sign-in. Sign in to Adobe again."],
        [404, "Commerce couldn't find something the datapack needs."],
        [409, 'It clashes with something already in Commerce.'],
        [400, "Commerce didn't accept it."],
        [422, "Commerce didn't accept it."],
    ])('words a %i plainly, with no status code', (status, words) => {
        expect(
            plainFailure(answered(status, 'V1/products', { message: 'Internal error' }), {
                kind: 'products',
            })
        ).toBe(words);
        // The same from the record's text, where the status is only in the words.
        expect(
            plainFailure(`Commerce answered ${status} for V1/products: {"message":"x"}`, {
                kind: 'products',
            })
        ).toBe(words);
    });

    it("translates Commerce's own messages it knows", () => {
        expect(plainFailure(answered(400, 'products', { message: 'Invalid SKU' }))).toBe(
            "Commerce didn't accept the SKU."
        );
        expect(
            plainFailure(
                answered(400, 'categories', {
                    message: 'URL key for specified store already exists.',
                }),
                {
                    kind: 'categories',
                }
            )
        ).toBe('Another category already uses its web address.');
    });

    it('keeps a sentence Demo Builder wrote, which is already plain', () => {
        expect(
            plainFailure(new Error('Choose the website and store view to install into first.'))
        ).toBe('Choose the website and store view to install into first.');
    });

    it('never passes on text that still looks raw: a route, a status code, a JSON body', () => {
        for (const raw of [
            'Request to /rest/V1/products failed',
            'HTTP 502 from the gateway',
            '{"message":"Something odd"}',
        ]) {
            expect(plainFailure(raw)).toBe("Commerce didn't accept it.");
        }
    });

    it('blames no one for a request that timed out without naming Commerce', () => {
        expect(plainFailure('Request timed out')).toBe('No answer came in time.');
    });

    it('says something when nothing was said', () => {
        expect(plainFailure(undefined)).toBe('It stopped without a reason.');
        expect(plainFailure('')).toBe('It stopped without a reason.');
    });
});

describe('plainSkipped: what was not added, grouped by reason', () => {
    const products = (n: number, reason: string): SkippedRowRecord[] =>
        Array.from({ length: n }, (_, i) => ({
            kind: 'products',
            key: `p${i + 2}`,
            reason,
            cause: { by: 'commerce', status: 400, message: reason },
        }));

    it('counts a group and says why in plain words, with what the Admin calls the rows', () => {
        const lines = plainSkipped([
            ...products(3, 'Invalid SKU'),
            {
                kind: 'categories',
                key: 'Default Category/Gear',
                reason: 'URL key for specified store already exists.',
                cause: {
                    by: 'commerce',
                    status: 400,
                    message: 'URL key for specified store already exists.',
                },
            },
            {
                kind: 'categories',
                key: 'Default Category/Racks/Wall',
                reason: 'its parent category Racks was skipped',
                cause: { by: 'needs', kind: 'categories', name: 'Racks' },
            },
        ]);

        expect(lines).toStrictEqual([
            "3 products weren't added: Commerce didn't accept their SKUs.",
            "Gear (under Default Category) wasn't added: another category already uses its web address.",
            "Wall wasn't added: its parent category, Racks, wasn't added.",
        ]);
    });

    it('names one product as the Admin does', () => {
        expect(plainSkipped(products(1, 'Invalid SKU'))).toStrictEqual([
            "Product p2 wasn't added: Commerce didn't accept its SKU.",
        ]);
    });

    it('names what a row needed by its kind in words, never its key', () => {
        expect(
            plainSkipped([
                {
                    kind: 'products',
                    key: 'cooler',
                    reason: 'x',
                    cause: { by: 'needs', kind: 'attribute_sets', name: 'Coolers' },
                },
                {
                    kind: 'products',
                    key: 'chair',
                    reason: 'x',
                    cause: { by: 'needs', kind: 'attribute_sets', name: 'Coolers' },
                },
                {
                    kind: 'coupons',
                    key: 'SPRING10',
                    reason: 'x',
                    cause: { by: 'missing', kind: 'cart_rules', name: 'Spring' },
                },
            ])
        ).toStrictEqual([
            "2 products weren't added: they need the attribute set Coolers, which wasn't added.",
            "Coupon SPRING10 wasn't added: it needs the cart rule Spring, which Commerce doesn't have.",
        ]);
    });

    it('gives an unknown Commerce message a plain fallback, and reads a record that predates causes', () => {
        expect(
            plainSkipped([
                {
                    kind: 'products',
                    key: 'a',
                    reason: 'The value of attribute "color" must be set.',
                },
                {
                    kind: 'products',
                    key: 'b',
                    reason: 'The value of attribute "size" must be set.',
                },
            ])
        ).toStrictEqual(["2 products weren't added: Commerce didn't accept them."]);
    });

    it('keeps the window short: the largest groups first, the rest counted', () => {
        const many: SkippedRowRecord[] = Array.from({ length: 9 }, (_, i) => ({
            kind: 'products',
            key: `p${i}`,
            reason: 'x',
            cause: { by: 'needs', kind: 'categories', name: `Cat ${i}` },
        }));

        const lines = plainSkipped([...products(4, 'Invalid SKU'), ...many]);

        expect(lines).toHaveLength(6);
        expect(lines[0]).toBe("4 products weren't added: Commerce didn't accept their SKUs.");
        expect(lines[5]).toBe("5 more weren't added.");
    });

    it('says nothing when nothing was skipped', () => {
        expect(plainSkipped(undefined)).toStrictEqual([]);
        expect(plainSkipped([])).toStrictEqual([]);
    });
});

describe('plainRowNote: the line on a data type with rows not added', () => {
    it('counts in the words of the data type', () => {
        expect(plainRowNote('products', 3)).toBe("3 products weren't added.");
        expect(plainRowNote('categories', 1)).toBe("1 category wasn't added.");
    });
});

describe('plainRefusedRemovals: what Commerce would not delete', () => {
    it('groups by reason, then says what tries again', () => {
        expect(
            plainRefusedRemovals(
                [
                    { kind: 'categories', key: 'Default Category/Gear', reason: 'Cannot delete' },
                    { kind: 'categories', key: 'Default Category/Bags', reason: 'Cannot delete' },
                ],
                'Uninstalling',
            ),
        ).toStrictEqual(["2 categories weren't removed: Commerce wouldn't delete them.", 'Uninstalling the datapack again tries again.']);
        expect(plainRefusedRemovals([], 'Installing')).toStrictEqual([]);
    });
});

describe('plain: a literal is already plain words', () => {
    it('keeps the literal it is handed', () => {
        expect(plain('Nothing was uninstalled.')).toBe('Nothing was uninstalled.');
    });
});
