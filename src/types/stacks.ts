/**
 * Stack Type Definitions
 *
 * Types for the stacks system that defines frontend + backend architecture
 * combinations (Headless, Edge Delivery, etc.) that can be combined with any brand.
 */

/**
 * OptionalAddon - An addon that can be optionally enabled for a stack
 */
export interface OptionalAddon {
    /** Addon component ID from components.json */
    id: string;

    /** Whether this addon should be pre-selected (default: false) */
    default?: boolean;
}

/**
 * Stack - Frontend + Backend architecture combination
 *
 * A stack defines the technical architecture including frontend framework,
 * backend service, and required dependencies. Stacks can be combined with
 * any brand to create a complete project configuration.
 */
export interface Stack {
    /** Unique identifier (e.g., 'headless', 'edge-delivery') */
    id: string;

    /** Display name for the stack */
    name: string;

    /** Description of the stack architecture */
    description: string;

    /** Icon identifier for the stack */
    icon?: string;

    /** Frontend component ID from components.json */
    frontend: string;

    /** Backend component ID from components.json */
    backend: string;

    /** Dependency component IDs from components.json */
    dependencies: string[];

    /** Optional addons available for this stack */
    optionalAddons?: OptionalAddon[];

    /** Feature highlights for UI display */
    features?: string[];

    /** Whether this stack requires GitHub OAuth authentication */
    requiresGitHub?: boolean;

    /** Whether this stack requires DA.live access */
    requiresDaLive?: boolean;
}

/**
 * AddonDefinition - Display metadata for an addon
 */
export interface AddonDefinition {
    /** Human-readable name */
    name: string;

    /** Short description for UI display */
    description: string;
}

/**
 * StacksConfig - Root structure of stacks.json
 */
export interface StacksConfig {
    /** Schema version (e.g., '1.0.0') */
    version: string;

    /** Addon display metadata keyed by addon ID */
    addonDefinitions?: Record<string, AddonDefinition>;

    /** Array of available stacks */
    stacks: Stack[];
}
