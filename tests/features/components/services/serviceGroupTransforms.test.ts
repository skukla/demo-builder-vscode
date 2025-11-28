/**
 * Tests for service group transformation helpers (SOP §6 compliance)
 */
import { toServiceGroupWithSortedFields, ServiceGroupDef, ServiceGroup } from '@/features/components/services/serviceGroupTransforms';

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
