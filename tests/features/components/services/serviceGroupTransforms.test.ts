/**
 * Tests for service group transformation helpers (SOP §6 compliance)
 */
import { toServiceGroupWithSortedFields, ServiceGroupDef, ServiceGroup, SERVICE_GROUP_DEFINITIONS } from '@/features/components/services/serviceGroupTransforms';

describe('toServiceGroupWithSortedFields', () => {
    // Mock field type for testing
    type TestField = { key: string; componentIds: string[] };

    it('returns group with unsorted fields when no fieldOrder', () => {
        const def: ServiceGroupDef = { id: 'test', label: 'Test' };
        const groups: Record<string, TestField[]> = {
            test: [
                { key: 'b', componentIds: ['comp1'] },
                { key: 'a', componentIds: ['comp1'] },
            ],
        };

        const result = toServiceGroupWithSortedFields(def, groups) as ServiceGroup;

        expect(result.id).toBe('test');
        expect(result.label).toBe('Test');
        expect(result.fields[0].key).toBe('b'); // Original order preserved
        expect(result.fields[1].key).toBe('a');
    });

    it('sorts fields by fieldOrder', () => {
        const def: ServiceGroupDef = { id: 'test', label: 'Test', fieldOrder: ['a', 'b'] };
        const groups: Record<string, TestField[]> = {
            test: [
                { key: 'b', componentIds: ['comp1'] },
                { key: 'a', componentIds: ['comp1'] },
            ],
        };

        const result = toServiceGroupWithSortedFields(def, groups) as ServiceGroup;

        expect(result.fields[0].key).toBe('a');
        expect(result.fields[1].key).toBe('b');
    });

    it('places unordered fields at end', () => {
        const def: ServiceGroupDef = { id: 'test', label: 'Test', fieldOrder: ['a'] };
        const groups: Record<string, TestField[]> = {
            test: [
                { key: 'b', componentIds: ['comp1'] },
                { key: 'a', componentIds: ['comp1'] },
                { key: 'c', componentIds: ['comp1'] },
            ],
        };

        const result = toServiceGroupWithSortedFields(def, groups) as ServiceGroup;

        expect(result.fields[0].key).toBe('a');
        // b and c come after a (unordered fields at position 999)
        expect(['b', 'c']).toContain(result.fields[1].key);
        expect(['b', 'c']).toContain(result.fields[2].key);
    });

    it('returns empty fields array when group not found', () => {
        const def: ServiceGroupDef = { id: 'test', label: 'Test' };
        const groups: Record<string, TestField[]> = {};

        const result = toServiceGroupWithSortedFields(def, groups) as ServiceGroup;

        expect(result.fields).toEqual([]);
    });

    it('handles multiple fields with defined order', () => {
        const def: ServiceGroupDef = {
            id: 'test',
            label: 'Test',
            fieldOrder: ['c', 'a', 'b'],
        };
        const groups: Record<string, TestField[]> = {
            test: [
                { key: 'b', componentIds: ['comp1'] },
                { key: 'c', componentIds: ['comp1'] },
                { key: 'a', componentIds: ['comp1'] },
            ],
        };

        const result = toServiceGroupWithSortedFields(def, groups) as ServiceGroup;

        expect(result.fields[0].key).toBe('c');
        expect(result.fields[1].key).toBe('a');
        expect(result.fields[2].key).toBe('b');
    });

    it('does not mutate original fields array', () => {
        const def: ServiceGroupDef = { id: 'test', label: 'Test', fieldOrder: ['a', 'b'] };
        const originalFields: TestField[] = [
            { key: 'b', componentIds: ['comp1'] },
            { key: 'a', componentIds: ['comp1'] },
        ];
        const groups: Record<string, TestField[]> = { test: originalFields };

        toServiceGroupWithSortedFields(def, groups);

        // Original array should not be mutated
        expect(originalFields[0].key).toBe('b');
        expect(originalFields[1].key).toBe('a');
    });
});

describe('SERVICE_GROUP_DEFINITIONS', () => {
    it('contains all expected group ids', () => {
        const ids = SERVICE_GROUP_DEFINITIONS.map(d => d.id);
        expect(ids).toContain('accs');
        expect(ids).toContain('adobe-commerce');
        expect(ids).toContain('catalog-service');
        expect(ids).toContain('mesh');
        expect(ids).toContain('adobe-assets');
        expect(ids).toContain('adobe-commerce-aco');
        expect(ids).toContain('experience-platform');
        expect(ids).toContain('other');
    });

    it('has unique ids', () => {
        const ids = SERVICE_GROUP_DEFINITIONS.map(d => d.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has unique order values', () => {
        const orders = SERVICE_GROUP_DEFINITIONS.map(d => d.order).filter((o): o is number => o !== undefined);
        expect(new Set(orders).size).toBe(orders.length);
    });

    it('has "other" group with highest order', () => {
        const otherGroup = SERVICE_GROUP_DEFINITIONS.find(d => d.id === 'other');
        const maxNonOtherOrder = Math.max(
            ...SERVICE_GROUP_DEFINITIONS.filter(d => d.id !== 'other').map(d => d.order ?? 0),
        );
        expect(otherGroup?.order).toBeGreaterThan(maxNonOtherOrder);
    });
});

/**
 * The field ORDER inside each group, pinned against literal key names.
 *
 * `fieldOrder` is the only thing deciding what an SC reads first in a service
 * group, and every group that has one has it for a reason: the endpoint before
 * the codes that address it, the URL before the credentials that open it. An
 * empty fieldOrder is not a neutral state — every field falls to the same
 * position and the group renders in whatever order the fields happened to
 * arrive in, which is the catalog's order, not a chosen one.
 *
 * The expected lists are written out as literal key strings rather than read
 * back off the definition: comparing a definition against itself would agree
 * with any order at all, including none.
 */
describe('SERVICE_GROUP_DEFINITIONS field order', () => {
    const defFor = (id: string): ServiceGroupDef => {
        const def = SERVICE_GROUP_DEFINITIONS.find((d) => d.id === id);
        if (!def) throw new Error(`No service group definition for ${id}`);
        return def;
    };

    /** Sort the group's fields having handed them in REVERSED, so the input
     *  order can never be mistaken for the intended one. */
    const orderOf = (id: string, expected: string[]): string[] => {
        const fields = [...expected].reverse().map((key) => ({ key }));
        return toServiceGroupWithSortedFields(defFor(id), { [id]: fields }).fields.map(
            (f) => f.key,
        );
    };

    it('puts the ACCS endpoint before the codes that address it', () => {
        expect(orderOf('accs', [
            'ACCS_GRAPHQL_ENDPOINT',
            'ACCS_WEBSITE_CODE',
            'ACCS_STORE_CODE',
            'ACCS_STORE_VIEW_CODE',
        ])).toEqual([
            'ACCS_GRAPHQL_ENDPOINT',
            'ACCS_WEBSITE_CODE',
            'ACCS_STORE_CODE',
            'ACCS_STORE_VIEW_CODE',
        ]);
    });

    it('puts the PaaS URLs before the credentials and then the codes', () => {
        expect(orderOf('adobe-commerce', [
            'ADOBE_COMMERCE_URL',
            'ADOBE_COMMERCE_ADMIN_URL',
            'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
            'ADOBE_COMMERCE_ADMIN_USERNAME',
            'ADOBE_COMMERCE_ADMIN_PASSWORD',
            'ADOBE_COMMERCE_WEBSITE_CODE',
            'ADOBE_COMMERCE_STORE_CODE',
            'ADOBE_COMMERCE_STORE_VIEW_CODE',
        ])).toEqual([
            'ADOBE_COMMERCE_URL',
            'ADOBE_COMMERCE_ADMIN_URL',
            'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
            'ADOBE_COMMERCE_ADMIN_USERNAME',
            'ADOBE_COMMERCE_ADMIN_PASSWORD',
            'ADOBE_COMMERCE_WEBSITE_CODE',
            'ADOBE_COMMERCE_STORE_CODE',
            'ADOBE_COMMERCE_STORE_VIEW_CODE',
        ]);
    });

    // CATALOG_SERVICE_ENDPOINT is deliberately absent from this group: it is
    // derived from the PaaS/ACCS endpoints and useServiceGroups no longer
    // renders it.
    it('puts the Catalog Service endpoint before the dataspace and key', () => {
        expect(orderOf('catalog-service', [
            'PAAS_CATALOG_SERVICE_ENDPOINT',
            'ADOBE_COMMERCE_ENVIRONMENT_ID',
            'ADOBE_CATALOG_API_KEY',
        ])).toEqual([
            'PAAS_CATALOG_SERVICE_ENDPOINT',
            'ADOBE_COMMERCE_ENVIRONMENT_ID',
            'ADOBE_CATALOG_API_KEY',
        ]);
    });

    it('puts the ACO URL and key before the tenant and environment ids', () => {
        expect(orderOf('adobe-commerce-aco', [
            'ACO_API_URL',
            'ACO_API_KEY',
            'ACO_TENANT_ID',
            'ACO_ENVIRONMENT_ID',
        ])).toEqual([
            'ACO_API_URL',
            'ACO_API_KEY',
            'ACO_TENANT_ID',
            'ACO_ENVIRONMENT_ID',
        ]);
    });

    // The groups with no fieldOrder render in catalog order on purpose — there
    // is no editorial sequence to keep, so pinning one here would invent a rule
    // the module does not hold.
    it('leaves a group with no fieldOrder in the order its fields arrived', () => {
        const fields = [{ key: 'z' }, { key: 'a' }, { key: 'm' }];
        expect(
            toServiceGroupWithSortedFields(defFor('mesh'), { mesh: fields }).fields.map(
                (f) => f.key,
            ),
        ).toEqual(['z', 'a', 'm']);
    });
});
