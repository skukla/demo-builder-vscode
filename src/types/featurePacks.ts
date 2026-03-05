import type { AddonSource } from './demoPackages';

/**
 * FeaturePack - A bundled enhancement that installs blocks, config flags,
 * initializers, and dependencies as a single selectable unit.
 *
 * Unlike block libraries (code-only) or addons (config-only), feature packs
 * span both code installation and configuration in a single entity.
 */
export interface FeaturePack {
    /** Unique identifier (e.g., 'b2b-commerce') */
    id: string;

    /** Display name */
    name: string;

    /** User-facing description */
    description: string;

    /** GitHub source repository */
    source: AddonSource;

    /** Compatible stack frontend types (e.g., ['eds-storefront']) */
    stackTypes: string[];

    /** Config flags to inject into config.json (e.g., { 'commerce-b2b-enabled': true }) */
    configFlags?: Record<string, boolean>;

    /** Block installation configuration */
    blocks?: {
        /** Whether to install blocks from source repo */
        install: boolean;
        /** Source directory within the repo (default: 'blocks') */
        sourceDir?: string;
    };

    /** Dropin initializer installation configuration */
    initializers?: {
        /** Whether to install initializers from source repo */
        install: boolean;
        /** Source directory within the repo */
        sourceDir?: string;
        /** Specific files to copy (if omitted, copies all from sourceDir) */
        files?: string[];
    };

    /** npm dependencies to merge into package.json */
    dependencies?: Record<string, string>;
}

/**
 * FeaturePacksConfig - Root structure of feature-packs.json
 */
export interface FeaturePacksConfig {
    /** Schema version (e.g., '1.0.0') */
    version: string;

    /** Array of available feature packs */
    featurePacks: FeaturePack[];
}
