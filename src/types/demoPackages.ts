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
 * CodePatchSource - External repository for code patches.
 *
 * Sibling of {@link ContentPatchSource}. Code patches are file-level
 * edits applied to a cloned storefront repo during create/reset, after
 * reset-to-template and after block install. The engine knows no canonical
 * file by name; everything comes from the external ledger fetched here.
 *
 * Per ADR-006 D3 the canonical home is `skukla/eds-demo-patches` (the
 * generalized successor to `eds-demo-content-patches`); a path of e.g.
 * `citisignal` selects the patch family for a storefront.
 */
export interface CodePatchSource {
    /** GitHub owner/organization of the patch repository */
    owner: string;
    /** GitHub repository name */
    repo: string;
    /** Path within repo to the patch family directory (contains code-patches.json) */
    path: string;
    /** Repo-relative path to the LKG file when this ledger tracks a non-default
     *  canonical (multi-canonical patches repos). Omitted when the ledger
     *  shares the default root `last-known-good` — e.g., citisignal + custom
     *  both track hlxsites/aem-boilerplate-commerce and share root LKG; b2b
     *  tracks the B2B template and sets `lkgFile: "b2b/last-known-good"`. */
    lkgFile?: string;
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
    /** Optional BYOM content overlay URL. When set, Config Service registers a
     *  `content.overlay` alongside the DA.live content source so a backend
     *  service can serve dynamic markup (e.g., per-SKU PDP HTML).
     *  See https://www.aem.live/developer/byom. */
    byomOverlayUrl?: string;
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
    /** Code patch IDs to apply during create/reset (canonical files + installed blocks).
     *  Sibling of contentPatches but operates on repo files. Step 5 of ADR-006 wires
     *  the CitiSignal storefront entries with these IDs pointing at the ledger in
     *  the eds-demo-patches repo. Empty / undefined for non-thin-layer storefronts. */
    codePatches?: string[];
    /** External repository for code patches. When set, the storefront is "thin-layer"
     *  (per ADR-006) — `lastSyncedCommit` records the LKG SHA read from this repo's
     *  `last-known-good` file rather than canonical main HEAD, and reset pins to LKG. */
    codePatchSource?: CodePatchSource;
    /** API Mesh requirement for this storefront (overrides package-level requiresMesh).
     *  - true: mesh auto-included, no user choice
     *  - false: no mesh, no user choice
     *  - 'optional': mesh toggle shown, user decides
     *  - undefined: inherit from package */
    requiresMesh?: boolean | 'optional';
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
