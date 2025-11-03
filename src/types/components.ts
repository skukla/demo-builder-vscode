/**
 * Component Type Definitions (Enhanced)
 *
 * Provides type-safe interfaces for component registry and component operations.
 * Replaces `any` types with specific component interfaces.
 */

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
    helpText?: string;
    group?: string;
    providedBy?: string;
    usedBy?: string[];
    options?: { value: string; label: string }[];
    validation?: {
        pattern?: string;
        message?: string;
    };
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
}

/**
 * ComponentEnvVars - Component environment variables configuration
 */
export interface ComponentEnvVars {
    requiredEnvVars?: string[];
    optionalEnvVars?: string[];
    services?: string[];
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
        envVars?: ComponentEnvVars;
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
        services?: string[];
        meshIntegration?: {
            sources?: Record<string, unknown>;
            handlers?: Record<string, unknown>;
        };
        providesEndpoint?: boolean;
        impact?: 'minimal' | 'moderate' | 'significant';
        removable?: boolean;
        defaultEnabled?: boolean;
    };
    compatibleBackends?: string[];
    features?: string[];
    requiresApiKey?: boolean;
    endpoint?: string;
    requiresDeployment?: boolean;
}

/**
 * RawComponentRegistry - Raw registry structure from JSON
 */
export interface RawComponentRegistry {
    version: string;
    components?: Record<string, RawComponentDefinition>;
    selectionGroups?: {
        frontends?: string[];
        backends?: string[];
        dependencies?: string[];
        integrations?: string[];
        appBuilderApps?: string[];
    };
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
        externalSystems?: string[];
        appBuilder?: string[];
    };
}

/**
 * TransformedComponentDefinition - Component after transformation
 *
 * After transformation:
 * - envVars becomes EnvVarDefinition[] (expanded from registry)
 * - services becomes ServiceDefinition[] (expanded from service IDs)
 */
export interface TransformedComponentDefinition extends Omit<RawComponentDefinition, 'configuration'> {
    configuration?: {
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
        meshIntegration?: {
            sources?: Record<string, unknown>;
            handlers?: Record<string, unknown>;
        };
        providesEndpoint?: boolean;
        impact?: 'minimal' | 'moderate' | 'significant';
        removable?: boolean;
        defaultEnabled?: boolean;
        envVars?: EnvVarDefinition[];
        services?: ServiceDefinition[];
    };
}

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
        externalSystems?: TransformedComponentDefinition[];
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
    externalSystems?: string[];
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
