/**
 * Demo Package Type Definitions
 *
 * Types for the unified demo-packages.json structure (nested storefronts keyed by stack ID).
 *
 * Structure:
 * - packages[] contain nested storefronts keyed by stack ID
 * - Each package has configDefaults (embedded brand data)
 * - EDS storefronts have explicit contentSource for DA.live content
 */

/**
 * GitOptions - Git clone options for storefront source
 */
export interface GitOptions {
    /** Perform a shallow clone (git clone --depth 1) */
    shallow: boolean;
}

/**
 * GitSource - Git source configuration for storefront cloning
 */
export interface GitSource {
    /** Source type (currently only 'git' supported) */
    type: 'git';
    /** Repository URL */
    url: string;
    /** Branch to clone */
    branch: string;
    /** Git clone options */
    gitOptions: GitOptions;
}

/**
 * DaLiveContentSource - DA.live content source configuration
 *
 * Used by EDS storefronts to specify the source of demo content.
 * This is explicit configuration, NOT derived from the GitHub template URL.
 */
export interface DaLiveContentSource {
    /** DA.live organization name */
    org: string;
    /** DA.live site name */
    site: string;
    /** Optional custom path to content index (defaults to /full-index.json) */
    indexPath?: string;
}

/**
 * ContentPatchSource - External repository for content patches
 *
 * Allows content patches to be fetched from an external GitHub repository
 * instead of being bundled with the extension. This decouples patch maintenance
 * from the Demo Builder release cycle.
 */
export interface ContentPatchSource {
    /** GitHub owner/organization of the patch repository */
    owner: string;
    /** GitHub repository name */
    repo: string;
    /** Path within repo to patch directory (contains index.json and patch files) */
    path: string;
}

/**
 * Storefront - A storefront variant within a package
 *
 * Storefronts are keyed by stack ID (e.g., 'headless-paas', 'eds-paas')
 * within the package's storefronts object.
 */
export interface Storefront {
    /** Display name for this storefront variant */
    name: string;
    /** Description of what this storefront includes */
    description: string;
    /** Icon identifier for the storefront */
    icon?: string;
    /** Whether this storefront should be featured */
    featured?: boolean;
    /** Tags for filtering and categorization */
    tags?: string[];
    /** Git source configuration for cloning */
    source: GitSource;
    /** DA.live content source for EDS storefronts (required for EDS stacks) */
    contentSource?: DaLiveContentSource;
    /** GitHub owner of the template repository (for reset-to-template operations) */
    templateOwner?: string;
    /** GitHub repository name of the template (for reset-to-template operations) */
    templateRepo?: string;
    /** Patch IDs to apply during reset (for repurpose flow) */
    patches?: string[];
    /** Content patch IDs to apply during DA.live content copy */
    contentPatches?: string[];
    /** External repository for content patches (if not using bundled patches) */
    contentPatchSource?: ContentPatchSource;
}

/**
 * AddonSource - GitHub repository source for an addon
 *
 * Used by addons that fetch content from an external repository
 * (e.g., the Commerce Block Collection fetches blocks from isle5).
 */
export interface AddonSource {
    /** GitHub owner/organization */
    owner: string;
    /** GitHub repository name */
    repo: string;
    /** Branch to fetch from */
    branch: string;
}

/**
 * AddonConfig - Configuration for a single addon within a package
 *
 * Simple string union: "required", "optional", or "excluded".
 * Source repository information is now defined globally in stacks.json addon definitions.
 */
export type AddonConfig = 'required' | 'optional' | 'excluded';


/**
 * Addons - Configuration for addon components
 *
 * Key: addon ID
 * Value: availability string ('required' | 'optional' | 'excluded')
 */
export type Addons = Record<string, AddonConfig>;

/**
 * DemoPackage - A unified demo package definition
 *
 * Packages group storefronts by brand/vertical. Each package contains
 * embedded configDefaults (brand data) and nested storefronts keyed
 * by stack ID.
 */
export interface DemoPackage {
    /** Unique identifier (e.g., 'citisignal', 'buildright') */
    id: string;

    /** Display name for the package */
    name: string;

    /** Description of the package */
    description: string;

    /** Icon identifier for the package */
    icon?: string;

    /** Whether this package should be featured in the UI */
    featured?: boolean;

    /** API Mesh requirement for this package.
     *  - true: mesh auto-included, no user choice
     *  - false (default): no mesh, no user choice
     *  - 'optional': mesh toggle shown, user decides */
    requiresMesh?: boolean | 'optional';

    /** Availability status (default: 'active') */
    status?: 'active' | 'coming-soon';

    /** Addons configuration for this package */
    addons?: Addons;

    /** Feature packs configuration for this package (required/optional/excluded per pack ID) */
    featurePacks?: Record<string, AddonConfig>;

    /** Default configuration values (env var name to value) - embedded brand data */
    configDefaults: Record<string, string>;

    /** Storefronts keyed by stack ID (e.g., 'headless-paas', 'eds-paas', 'eds-accs') */
    storefronts: Record<string, Storefront>;
}

/**
 * DemoPackagesConfig - Root structure of demo-packages.json
 */
export interface DemoPackagesConfig {
    /** Schema version (e.g., '1.0.0') */
    version: string;

    /** Array of available demo packages */
    packages: DemoPackage[];
}
