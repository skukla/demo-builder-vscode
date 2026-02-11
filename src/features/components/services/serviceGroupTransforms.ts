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
/**
 * Shared service group definitions for both Wizard and Configure screens.
 *
 * Single source of truth — empty groups are hidden by the existing
 * `.filter(group => group.fields.length > 0)` in both consumers.
 */
export const SERVICE_GROUP_DEFINITIONS: ServiceGroupDef[] = [
    { id: 'accs', label: 'Adobe Commerce Cloud Service', order: 1, fieldOrder: ['ACCS_GRAPHQL_ENDPOINT', 'ACCS_WEBSITE_CODE', 'ACCS_STORE_CODE', 'ACCS_STORE_VIEW_CODE', 'ACCS_CUSTOMER_GROUP'] },
    { id: 'adobe-commerce', label: 'Adobe Commerce', order: 2, fieldOrder: ['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT', 'ADOBE_COMMERCE_WEBSITE_CODE', 'ADOBE_COMMERCE_STORE_CODE', 'ADOBE_COMMERCE_STORE_VIEW_CODE', 'ADOBE_COMMERCE_CUSTOMER_GROUP', 'ADOBE_COMMERCE_ADMIN_USERNAME', 'ADOBE_COMMERCE_ADMIN_PASSWORD'] },
    { id: 'catalog-service', label: 'Catalog Service', order: 3, fieldOrder: ['ADOBE_CATALOG_SERVICE_ENDPOINT', 'ADOBE_COMMERCE_ENVIRONMENT_ID', 'ADOBE_CATALOG_API_KEY'] },
    { id: 'mesh', label: 'API Mesh', order: 4 },
    { id: 'adobe-assets', label: 'Adobe Assets', order: 5 },
    { id: 'adobe-commerce-aco', label: 'Adobe Commerce Optimizer', order: 6, fieldOrder: ['ACO_API_URL', 'ACO_API_KEY', 'ACO_TENANT_ID', 'ACO_ENVIRONMENT_ID'] },
    { id: 'integration-service', label: 'Kukla Integration Service', order: 7 },
    { id: 'experience-platform', label: 'Experience Platform', order: 8 },
    { id: 'other', label: 'Additional Settings', order: 99 },
];

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
