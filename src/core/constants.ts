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
    /** Legacy mesh component ID */
    COMMERCE_MESH: 'commerce-mesh',
    /** Edge Delivery Services storefront component */
    EDS_STOREFRONT: 'eds-storefront',
    /** Demo inspector overlay component */
    DEMO_INSPECTOR: 'demo-inspector',
    /** EDS-specific API Mesh */
    EDS_COMMERCE_MESH: 'eds-commerce-mesh',
    /** Headless-specific API Mesh */
    HEADLESS_COMMERCE_MESH: 'headless-commerce-mesh',
} as const;

/** Type for component ID values */
export type ComponentId = typeof COMPONENT_IDS[keyof typeof COMPONENT_IDS];
