/**
 * Brand Type Definitions
 *
 * Types for the brands system that defines content/vertical configurations
 * (CitiSignal, Default, BuildRight) that can be combined with any stack.
 */

/**
 * ContentSources - Content sources for different stack types
 */
export interface ContentSources {
    /** DA.live content source URL for Edge Delivery Services */
    eds?: string;
}

/**
 * Brand - Content/vertical configuration
 *
 * A brand defines the content, store codes, and branding that can be
 * combined with any stack (Headless, Edge Delivery, etc.).
 */
export interface Brand {
    /** Unique identifier (e.g., 'citisignal', 'default', 'buildright') */
    id: string;

    /** Display name for the brand */
    name: string;

    /** Description of the brand */
    description: string;

    /** Icon identifier for the brand */
    icon?: string;

    /** Whether this brand should be featured in the UI */
    featured?: boolean;

    /** Default configuration values for this brand (env var name to value) */
    configDefaults: Record<string, string>;

    /** Content sources by stack type */
    contentSources: ContentSources;
}

/**
 * BrandsConfig - Root structure of brands.json
 */
export interface BrandsConfig {
    /** Schema version (e.g., '1.0.0') */
    version: string;

    /** Array of available brands */
    brands: Brand[];
}
