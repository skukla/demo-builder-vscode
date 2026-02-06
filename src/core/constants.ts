/**
 * Core extension constants
 */

/**
 * Global state key for tracking last update check version
 */
export const LAST_UPDATE_CHECK_VERSION = 'lastUpdateCheckVersion';

/**
 * Component IDs for standardized component instance access
 *
 * These IDs match the component definitions in templates/components.json
 * and are used for type-safe access to componentInstances entries.
 */
export const COMPONENT_IDS = {
    /** Edge Delivery Services storefront component */
    EDS_STOREFRONT: 'eds-storefront',
    /** Demo inspector overlay component */
    DEMO_INSPECTOR: 'demo-inspector',
    /** EDS-specific API Mesh (for EDS PaaS storefronts) */
    EDS_COMMERCE_MESH: 'eds-commerce-mesh',
    /** EDS-specific API Mesh (for EDS ACCS storefronts) */
    EDS_ACCS_MESH: 'eds-accs-mesh',
    /** Headless-specific API Mesh (for Next.js storefronts) */
    HEADLESS_COMMERCE_MESH: 'headless-commerce-mesh',
} as const;

/** Type for component ID values */
export type ComponentId = (typeof COMPONENT_IDS)[keyof typeof COMPONENT_IDS];

/**
 * All mesh component IDs
 *
 * Use isMeshComponentId() or hasMeshInDependencies() for type-safe checks.
 */
export const MESH_COMPONENT_IDS = [
    COMPONENT_IDS.EDS_COMMERCE_MESH,
    COMPONENT_IDS.EDS_ACCS_MESH,
    COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
] as const;

/** Type for mesh component ID values */
export type MeshComponentId = (typeof MESH_COMPONENT_IDS)[number];

/**
 * Check if a component ID is a mesh component
 */
export function isMeshComponentId(componentId: string): componentId is MeshComponentId {
    return MESH_COMPONENT_IDS.includes(componentId as MeshComponentId);
}

/**
 * Check if dependencies array includes any mesh component
 */
export function hasMeshInDependencies(dependencies: string[] | undefined): boolean {
    return dependencies?.some((id) => isMeshComponentId(id)) ?? false;
}
