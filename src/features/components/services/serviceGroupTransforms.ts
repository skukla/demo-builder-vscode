/**
 * Service group transformation helpers (SOP §6 compliance)
 *
 * Extracts complex callback transformation logic from inline callbacks
 * to named functions for improved readability and testability.
 */

/**
 * Service group definition interface
 */
export interface ServiceGroupDef {
    id: string;
    label: string;
    order?: number;
    fieldOrder?: string[];
}

/**
 * Field interface (minimal for transformation)
 * Only requires 'key' property for sorting operations
 */
export interface FieldWithKey {
    key: string;
}

/**
 * Service group with fields
 */
export interface ServiceGroup {
    id: string;
    label: string;
    fields: FieldWithKey[];
}

/**
 * Sort fields by field order, placing unordered fields at end (SOP §6 compliance)
 */
function sortByFieldOrder<T extends FieldWithKey>(fields: T[], fieldOrder: string[]): T[] {
    return [...fields].sort((a, b) => {
        const aIndex = fieldOrder.indexOf(a.key);
        const bIndex = fieldOrder.indexOf(b.key);
        const aPos = aIndex === -1 ? 999 : aIndex;
        const bPos = bIndex === -1 ? 999 : bIndex;
        return aPos - bPos;
    });
}

/**
 * Generic service group result that preserves field type
 */
export interface ServiceGroupResult<T> {
    id: string;
    label: string;
    fields: T[];
}

/**
 * Transform service group definition to service group with sorted fields (SOP §6 compliance)
 *
 * Extracts complex callback with nested sorting logic to named function.
 *
 * @param def - Service group definition
 * @param groups - Record mapping group IDs to arrays of fields
 * @returns ServiceGroup with sorted fields, preserving the field type
 */
export function toServiceGroupWithSortedFields<T extends FieldWithKey>(
    def: ServiceGroupDef,
    groups: Record<string, T[]>,
): ServiceGroupResult<T> {
    const fields = groups[def.id] || [];

    const sortedFields = def.fieldOrder
        ? sortByFieldOrder(fields, def.fieldOrder)
        : fields;

    return {
        id: def.id,
        label: def.label,
        fields: sortedFields,
    };
}
