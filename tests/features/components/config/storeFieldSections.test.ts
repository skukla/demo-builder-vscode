/**
 * The Connection / Business Structure split, shared by both commerce surfaces.
 *
 * The wizard has always sliced its Commerce area three ways; the Configure screen
 * showed one undifferentiated tab. The split now lives here, in `features/components`,
 * because both surfaces consume it and features do not import each other.
 *
 * The rule for `connection` is "everything in a connection group that is NOT a
 * store code" — deliberately not "is in CONNECTION_FIELDS". Under the old
 * membership test, a field in a connection group that was neither a connection
 * field nor a store code belonged to NO section and rendered nowhere:
 * `ADOBE_COMMERCE_ADMIN_URL` is exactly that, and it disappeared from the wizard.
 */

import {
    filterGroupsForSection,
    isConnectionGroup,
} from '@/features/components/config/storeFieldHelpers';

const f = (key: string) => ({ key });

const GROUPS = [
    {
        id: 'adobe-commerce',
        label: 'Adobe Commerce',
        fields: [
            f('ADOBE_COMMERCE_URL'),
            f('ADOBE_COMMERCE_ADMIN_USERNAME'),
            f('ADOBE_COMMERCE_ADMIN_URL'),
            f('ADOBE_COMMERCE_WEBSITE_CODE'),
            f('ADOBE_COMMERCE_STORE_CODE'),
            f('ADOBE_COMMERCE_STORE_VIEW_CODE'),
        ],
    },
    { id: 'catalog-service', label: 'Catalog Service', fields: [f('ADOBE_CATALOG_API_KEY')] },
];

const keysIn = (section: 'connection' | 'business-structure' | 'catalog') =>
    filterGroupsForSection(GROUPS, section).flatMap((g) => g.fields.map((x) => x.key));

describe('filterGroupsForSection', () => {
    it('puts the connection fields under connection', () => {
        expect(keysIn('connection')).toEqual(
            expect.arrayContaining(['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_ADMIN_USERNAME'])
        );
    });

    it('puts the three store codes under business-structure', () => {
        expect(keysIn('business-structure')).toEqual([
            'ADOBE_COMMERCE_WEBSITE_CODE',
            'ADOBE_COMMERCE_STORE_CODE',
            'ADOBE_COMMERCE_STORE_VIEW_CODE',
        ]);
    });

    it('gives ADOBE_COMMERCE_ADMIN_URL a home instead of orphaning it', () => {
        // The field that used to render in NO section. It is in a connection
        // group, is not a store code, and is not in CONNECTION_FIELDS — so a
        // membership test dropped it and a negation keeps it.
        expect(keysIn('connection')).toContain('ADOBE_COMMERCE_ADMIN_URL');
        expect(keysIn('business-structure')).not.toContain('ADOBE_COMMERCE_ADMIN_URL');
        expect(keysIn('catalog')).not.toContain('ADOBE_COMMERCE_ADMIN_URL');
    });

    it('every field lands in exactly one section — no orphans, no duplicates', () => {
        const all = [
            ...keysIn('connection'),
            ...keysIn('business-structure'),
            ...keysIn('catalog'),
        ];
        const declared = GROUPS.flatMap((g) => g.fields.map((x) => x.key));

        expect(all.sort()).toEqual(declared.sort());
    });

    it('puts non-connection groups under catalog', () => {
        expect(keysIn('catalog')).toEqual(['ADOBE_CATALOG_API_KEY']);
    });

    it('drops groups a section empties', () => {
        expect(filterGroupsForSection(GROUPS, 'connection').map((g) => g.id)).toEqual([
            'adobe-commerce',
        ]);
    });

    it('knows which group ids are connection groups', () => {
        expect(isConnectionGroup('accs')).toBe(true);
        expect(isConnectionGroup('adobe-commerce')).toBe(true);
        expect(isConnectionGroup('catalog-service')).toBe(false);
    });
});
