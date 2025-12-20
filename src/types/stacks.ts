/**
 * Stack Type Definitions
 *
 * Types for the stacks system that defines frontend + backend architecture
 * combinations (Headless, Edge Delivery, etc.) that can be combined with any brand.
 */

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

    /** Optional addon component IDs that can be enabled for this stack */
    optionalAddons?: string[];

    /** Feature highlights for UI display */
    features?: string[];

    /** Whether this stack requires GitHub OAuth authentication */
    requiresGitHub?: boolean;

    /** Whether this stack requires DA.live access */
    requiresDaLive?: boolean;
}

/**
 * StacksConfig - Root structure of stacks.json
 */
export interface StacksConfig {
    /** Schema version (e.g., '1.0.0') */
    version: string;

    /** Array of available stacks */
    stacks: Stack[];
}
