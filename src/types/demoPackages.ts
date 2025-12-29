/**
 * Demo Package Type Definitions
 *
 * Types for the unified demo-packages.json structure (Option A: Nested Storefronts).
 *
 * Structure:
 * - packages[] contain nested storefronts keyed by stack ID
 * - Each package has configDefaults (embedded brand data)
 * - No contentSources (EDS URLs derivable from source.url)
 */

/**
 * GitOptions - Git clone options for storefront source
 */
export interface GitOptions {
    /** Perform a shallow clone (git clone --depth 1) */
    shallow: boolean;
    /** Initialize and update submodules recursively */
    recursive: boolean;
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
 * Submodule - Definition for a submodule to be included
 */
export interface Submodule {
    /** Path within the project where submodule should be placed */
    path: string;
    /** Repository reference (e.g., 'org/repo-name') */
    repository: string;
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
    /** Submodule definitions to include */
    submodules?: Record<string, Submodule>;
}

/**
 * Addons - Configuration for addon components
 *
 * Key: addon ID
 * Value: "required" (pre-checked, disabled) or "optional" (toggleable)
 */
export type Addons = Record<string, 'required' | 'optional'>;

/**
 * DemoPackage - A unified demo package definition
 *
 * Packages group storefronts by brand/vertical. Each package contains
 * embedded configDefaults (brand data) and nested storefronts keyed
 * by stack ID.
 *
 * Note: contentSources is not included as EDS URLs are derivable from
 * the storefront's source.url (GitHub repository).
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
