/**
 * Component Type Definitions (Enhanced)
 *
 * Provides type-safe interfaces for component registry and component operations.
 * Replaces `any` types with specific component interfaces.
 */

import { FieldHelp } from './webview';

/**
 * EnvVarDefinition - Environment variable definition from registry
 */
export interface EnvVarDefinition {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'select' | 'boolean' | 'number';
    required?: boolean;
    default?: string | boolean | number;
    placeholder?: string;
    description?: string;
    /** Rich help content with optional screenshot */
    help?: FieldHelp;
    group?: string;
    providedBy?: string;
    usedBy?: string[];
    options?: { value: string; label: string }[];
    validation?: {
        pattern?: string;
        message?: string;
    };
    /** Array of source variable names to derive this variable from (first non-empty value wins) */
    derivedFrom?: string[];
}

/**
 * SubmoduleConfig - Git submodule configuration within a component
 */
export interface SubmoduleConfig {
    /** Relative path within parent component (e.g., "packages/demo-inspector") */
    path: string;
    /** GitHub repository in owner/repo format (e.g., "skukla/demo-inspector") */
    repository: string;
}

/**
 * ServiceDefinition - Service definition from registry
 */
export interface ServiceDefinition {
    id: string;
    name: string;
    required?: boolean;
    endpoint?: string;
    requiresApiKey?: boolean;
    requiredEnvVars?: string[];
    optionalEnvVars?: string[];
    description?: string;
    envVars?: EnvVarDefinition[]; // Added during transformation
    backendSpecific?: boolean; // Whether this service has backend-specific implementations
    requiredEnvVarsByBackend?: Record<string, string[]>; // Env vars grouped by backend ID
}

/**
 * ConfigFileDefinition - Configuration file definition
 * 
 * All config files are peers - .env and .json are just different formats for
 * the same purpose (storing component configuration). Components can define
 * multiple config files in different formats (e.g., EDS needs both .env and site.json).
 * 
 * @example
 * // EDS needs both .env (for build) and site.json (for browser runtime)
 * "configFiles": {
 *   ".env": { "format": "env" },
 *   "site.json": {
 *     "format": "json",
 *     "fieldRenames": { "MESH_ENDPOINT": "commerce-core-endpoint" }
 *   }
 * }
 */
export interface ConfigFileDefinition {
    /** File format: env (KEY=VALUE), json, yaml, or ini */
    format: 'env' | 'json' | 'yaml' | 'ini';
    /** Optional template file name (relative to component root) */
    template?: string;
    /** Rename env vars for this format. Source (env var key) → Target (output field name) */
    fieldRenames?: Record<string, string>;
    /** Additional fields with static values not from env vars */
    additionalFields?: Record<string, unknown>;
}

/**
 * RawComponentDefinition - Raw component from templates/components.json
 */
export interface RawComponentDefinition {
    id: string;
    name: string;
    type?: 'frontend' | 'backend' | 'dependency' | 'external-system' | 'app-builder';
    subType?: 'mesh' | 'inspector' | 'utility' | 'service';
    description?: string;
    icon?: string | { light: string; dark: string };
    source?: {
        type: 'git' | 'npm' | 'local';
        url?: string;
        package?: string;
        version?: string;
        branch?: string;
        gitOptions?: {
            shallow?: boolean;
            recursive?: boolean;
            tag?: string;
            commit?: string;
        };
        timeouts?: {
            clone?: number;
            install?: number;
        };
    };
    dependencies?: {
        required: string[];
        optional: string[];
    };
    configuration?: {
        // Flat structure - requiredEnvVars/optionalEnvVars directly in configuration
        requiredEnvVars?: string[];
        optionalEnvVars?: string[];
        configFiles?: Record<string, ConfigFileDefinition>;
        port?: number;
        nodeVersion?: string;
        buildScript?: string;
        required?: Record<string, {
            type: 'string' | 'url' | 'password' | 'number' | 'boolean';
            label: string;
            placeholder?: string;
            default?: string | number | boolean;
            validation?: string;
        }>;
        requiredServices?: string[];
        providesServices?: string[]; // Service IDs this component provides to others
        services?: string[];
        meshIntegration?: {
            sources?: Record<string, unknown>;
            handlers?: Record<string, unknown>;
        };
        providesEndpoint?: boolean;
        providesEnvVars?: string[];
        requiresDeployment?: boolean;
        deploymentTarget?: string;
        runtime?: string;
        actions?: string[];
        impact?: 'minimal' | 'moderate' | 'significant';
        removable?: boolean;
        defaultEnabled?: boolean;
        position?: string;
        startOpen?: boolean;
    };
    compatibleBackends?: string[];
    features?: string[];
    requiresApiKey?: boolean;
    endpoint?: string;
    requiresDeployment?: boolean;
    /** Git submodules contained within this component */
    submodules?: Record<string, SubmoduleConfig>;
    /** Runtime metadata populated during project creation (e.g., EDS URLs) */
    metadata?: Record<string, unknown>;
}

/**
 * RawComponentRegistry - Raw registry structure from JSON
 *
 * Supports components.json v3.0.0 structure where components are in
 * separate top-level sections (frontends, backends, mesh, etc.) rather
 * than a unified 'components' map.
 */
export interface RawComponentRegistry {
    version: string;
    /** @deprecated v2.0 structure - use separate sections below */
    components?: Record<string, RawComponentDefinition>;
    selectionGroups?: {
        frontends?: string[];
        backends?: string[];
        dependencies?: string[];
        integrations?: string[];
        appBuilderApps?: string[];
    };
    /** v3.0.0: Frontend components (e.g., eds, headless) */
    frontends?: Record<string, RawComponentDefinition>;
    /** v3.0.0: Backend components (e.g., adobe-commerce-paas) */
    backends?: Record<string, RawComponentDefinition>;
    /** v3.0.0: Mesh components (e.g., commerce-mesh) */
    mesh?: Record<string, RawComponentDefinition>;
    /** v3.0.0: Dependencies (e.g., demo-inspector) */
    dependencies?: Record<string, RawComponentDefinition>;
    /** v3.0.0: App Builder apps (e.g., integration-service) */
    appBuilderApps?: Record<string, RawComponentDefinition>;
    /** v3.0.0: Integrations (e.g., experience-platform) */
    integrations?: Record<string, RawComponentDefinition>;
    infrastructure?: Record<string, RawComponentDefinition>;
    services?: Record<string, ServiceDefinition>;
    envVars?: Record<string, Omit<EnvVarDefinition, 'key'>>;
    presets?: PresetDefinition[];
}

/**
 * PresetDefinition - Component preset
 */
export interface PresetDefinition {
    id: string;
    name: string;
    description?: string;
    selections: {
        frontend: string;
        backend: string;
        dependencies: string[];
        integrations?: string[];
        appBuilder?: string[];
    };
}

/**
 * TransformedComponentDefinition - Component after transformation
 *
 * NO transformation anymore - just passes through the flat structure from JSON:
 * - requiredEnvVars/optionalEnvVars directly in configuration (NOT nested)
 * - services remains as-is (no transformation needed)
 */
export type TransformedComponentDefinition = RawComponentDefinition;

/**
 * ComponentRegistry - Transformed registry for runtime use
 */
export interface ComponentRegistry {
    version: string;
    infrastructure?: TransformedComponentDefinition[];
    components: {
        frontends: TransformedComponentDefinition[];
        backends: TransformedComponentDefinition[];
        dependencies: TransformedComponentDefinition[];
        mesh?: TransformedComponentDefinition[];
        integrations?: TransformedComponentDefinition[];
        appBuilder?: TransformedComponentDefinition[];
    };
    services?: Record<string, ServiceDefinition>;
    envVars?: Record<string, Omit<EnvVarDefinition, 'key'>>;
    presets?: PresetDefinition[];
}

/**
 * ComponentSelection - User's component selections
 */
export interface ComponentSelection {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    integrations?: string[];
    appBuilder?: string[];
    services?: ServiceDefinition[];
    preset?: string;
}

/**
 * ComponentConfigs - Component-specific environment configurations
 */
export type ComponentConfigs = Record<string, ComponentConfig>;

/**
 * ComponentConfig - Configuration values for a specific component
 */
export type ComponentConfig = Record<string, string | boolean | number | undefined>;

/**
 * CompatibilityCheckResult - Result of compatibility check
 */
export interface CompatibilityCheckResult {
    compatible: boolean;
    recommended?: boolean;
    notes?: string;
    missingDependencies?: string[];
}
