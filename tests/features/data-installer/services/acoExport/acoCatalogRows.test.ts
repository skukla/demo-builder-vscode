/**
 * The two catalog-wide ACO kinds: `aco_metadata` (one row per attribute per store view) and
 * `aco_categories` (one row per category per store view), made the way the service makes them
 * (aco-export-spec.md §3).
 */

import {
    categoryRows,
    categorySlugs,
    metadataRows,
} from '@/features/data-installer/services/acoExport/acoCatalogRows';
import type { CommerceAttributeRow } from '@/types/acoPack';
import { ACO_CATEGORIES, attributeRow } from '../../../../helpers/acoFixtures';

describe('metadataRows', () => {
    it('makes one row per attribute per store view, the store view code as its locale', () => {
        const rows = metadataRows([attributeRow({ attribute_code: 'color' })], ['default', 'fr']);

        expect(rows.map((r) => [r.code, r.source.locale])).toEqual([
            ['color', 'default'],
            ['color', 'fr'],
        ]);
    });

    it('sets the search behaviour the service sets on every row', () => {
        const [row] = metadataRows([attributeRow({ attribute_code: 'color' })], ['default']);

        expect(row.searchTypes).toEqual(['AUTOCOMPLETE']);
        expect(row.searchWeight).toBe(1);
    });

    it('labels by the attribute label, else the admin label, else the code', () => {
        const rows = metadataRows(
            [
                attributeRow({
                    attribute_code: 'a',
                    frontend_label: 'Front',
                    default_frontend_label: 'Admin',
                }),
                attributeRow({ attribute_code: 'b', default_frontend_label: 'Admin' }),
                { attribute_code: 'c' },
            ],
            ['default']
        );

        expect(rows.map((r) => r.label)).toEqual(['Front', 'Admin', 'c']);
    });

    it.each<[Partial<CommerceAttributeRow>, string]>([
        [{ frontend_input: 'boolean', backend_type: 'int' }, 'BOOLEAN'],
        [{ frontend_input: 'price', backend_type: 'decimal' }, 'DECIMAL'],
        [{ frontend_input: 'text', backend_type: 'decimal' }, 'DECIMAL'],
        [{ frontend_input: 'select', backend_type: 'int' }, 'INTEGER'],
        [{ frontend_input: 'text', backend_type: 'varchar' }, 'TEXT'],
    ])('types %j as %s', (fields, dataType) => {
        const [row] = metadataRows([{ attribute_code: 'x', ...fields }], ['default']);
        expect(row.dataType).toBe(dataType);
    });

    it('shows it on the product page when Commerce says nothing about where', () => {
        const [row] = metadataRows([{ attribute_code: 'x' }], ['default']);
        expect(row.visibleIn).toEqual(['PRODUCT_DETAIL']);
    });

    it('shows it everywhere when every flag it reads says nowhere, as the service does', () => {
        const [row] = metadataRows(
            [{ attribute_code: 'x', is_visible_on_front: false }],
            ['default']
        );
        expect(row.visibleIn).toEqual([
            'PRODUCT_DETAIL',
            'PRODUCT_LISTING',
            'SEARCH_RESULTS',
            'PRODUCT_COMPARE',
        ]);
    });

    it('reads where it shows from the flags, testing them against true as the service does', () => {
        const [row] = metadataRows(
            [
                attributeRow({
                    attribute_code: 'x',
                    is_visible_on_front: true,
                    is_used_in_grid: true,
                    is_searchable: true,
                    is_comparable: false,
                }),
            ],
            ['default']
        );
        expect(row.visibleIn).toEqual(['PRODUCT_DETAIL', 'PRODUCT_LISTING', 'SEARCH_RESULTS']);
    });

    it('carries the service quirk: a "0" flag is not false, so it is truthy where Boolean() reads it', () => {
        const [row] = metadataRows(
            [attributeRow({ attribute_code: 'x', is_searchable: '0', is_filterable: false })],
            ['default']
        );

        expect(row.searchable).toBe(true);
        expect(row.filterable).toBe(false);
        expect(row.visibleIn).toEqual(['PRODUCT_DETAIL']);
    });

    it('leaves out filterable, sortable and searchable when Commerce does not send them', () => {
        const [row] = metadataRows([{ attribute_code: 'x' }], ['default']);
        expect(row).not.toHaveProperty('filterable');
        expect(row).not.toHaveProperty('sortable');
        expect(row).not.toHaveProperty('searchable');
    });

    it('leaves out an attribute with no code', () => {
        expect(metadataRows([{ attribute_code: '  ' }], ['default'])).toStrictEqual([]);
    });
});

describe('categoryRows', () => {
    it('leaves out Root Catalog and every store root, from every root, and keeps the rest', () => {
        const rows = categoryRows(ACO_CATEGORIES, 'default');

        expect(rows.map((r) => r.slug)).toEqual(['men', 'men/tops', 'gear']);
    });

    it('names each by its trimmed name, its slug from the url path, for this store view', () => {
        const [men] = categoryRows(ACO_CATEGORIES, 'fr');

        expect(men).toEqual({
            slug: 'men',
            source: { locale: 'fr' },
            name: 'Men',
            description: null,
        });
    });

    it('takes the description from the category itself and is null without one', () => {
        const rows = categoryRows(
            [
                ...ACO_CATEGORIES.slice(0, 2),
                {
                    id: 9,
                    name: 'Sale',
                    parent_id: 2,
                    description: 'Half off',
                    custom_attributes: [{ attribute_code: 'url_path', value: 'sale' }],
                },
            ],
            'default'
        );

        expect(rows).toEqual([
            { slug: 'sale', source: { locale: 'default' }, name: 'Sale', description: 'Half off' },
        ]);
    });

    it('leaves out a category with no usable url path or no name', () => {
        const rows = categoryRows(
            [
                ...ACO_CATEGORIES.slice(0, 2),
                { id: 10, name: 'No path', parent_id: 2 },
                {
                    id: 11,
                    name: '  ',
                    parent_id: 2,
                    custom_attributes: [{ attribute_code: 'url_path', value: 'blank' }],
                },
            ],
            'default'
        );
        expect(rows).toStrictEqual([]);
    });
});

describe('categorySlugs', () => {
    it('maps every category with a usable url path by id, store roots included', () => {
        const slugs = categorySlugs(ACO_CATEGORIES);

        expect(slugs.get('3')).toBe('men/tops');
        expect(slugs.get('2')).toBe('default-category');
        expect(slugs.has('1')).toBe(false);
    });
});
