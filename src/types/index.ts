export interface Project {
    name: string;
    template?: ProjectTemplate;
    created: Date;
    lastModified: Date;
    path: string;
    status: ProjectStatus;
    organization?: string;
    adobe?: AdobeConfig;
    commerce?: CommerceConfig;
    frontend?: FrontendConfig;
    mesh?: MeshConfig;
    inspector?: InspectorConfig;
    // Component-based configuration
    components?: {
        frontend?: string;  // Component ID
        backend?: string;   // Component ID  
        dependencies?: string[]; // Component IDs
    };
    // Aliases for compatibility
    createdAt?: Date;
    updatedAt?: Date;
}

export type ProjectTemplate = 
    | 'commerce-paas'
    | 'commerce-saas'
    | 'aem-commerce'
    | 'custom';

export type ProjectStatus = 
    | 'created'
    | 'configuring'
    | 'ready'
    | 'running'
    | 'stopped'
    | 'error';

export interface AdobeConfig {
    projectId: string;
    projectName: string;
    organization: string;
    workspace: string;
    authenticated: boolean;
}

export interface CommerceConfig {
    type: 'platform-as-a-service' | 'software-as-a-service';
    instance: {
        url: string;
        environmentId: string;
        storeView: string;
        websiteCode: string;
        storeCode: string;
    };
    services: {
        catalog?: {
            enabled: boolean;
            endpoint: string;
            apiKey?: string;
        };
        liveSearch?: {
            enabled: boolean;
            endpoint: string;
            apiKey?: string;
        };
    };
}

export interface FrontendConfig {
    path: string;
    version: string;
    port: number;
    status: 'stopped' | 'starting' | 'running' | 'error';
    pid?: number;
    url?: string;
}

export interface MeshConfig {
    id: string;
    status: 'not-deployed' | 'deploying' | 'deployed' | 'error';
    endpoint?: string;
    lastDeployed?: Date;
    mode: 'deployed' | 'local-proxy';
}

export interface InspectorConfig {
    enabled: boolean;
    version: string;
    installed: boolean;
}

export interface ProcessInfo {
    pid: number;
    port: number;
    startTime: Date;
    command: string;
    status: 'running' | 'stopped' | 'error';
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface LicenseKey {
    key: string;
    email?: string;
    issued: string;
    expires?: string;
    revoked: boolean;
    notes?: string;
}

export interface ComponentDefinition {
    id: string;
    name: string;
    type: 'frontend' | 'backend' | 'dependency' | 'external-system' | 'app-builder';
    subType?: 'mesh' | 'inspector' | 'utility' | 'service';
    description?: string;
    source?: ComponentSource;
    dependencies?: ComponentDependencies;
    compatibleBackends?: string[];
    configuration?: ComponentConfiguration;
    features?: string[];
    requiresApiKey?: boolean;
    endpoint?: string;
    requiresDeployment?: boolean;
}

export interface ComponentSource {
    type: 'git' | 'npm' | 'local';
    url?: string;
    package?: string;
    version?: string;
    branch?: string;
}

export interface ComponentDependencies {
    required: string[];
    optional: string[];
}

export interface ComponentConfiguration {
    envVars?: string[];
    port?: number;
    nodeVersion?: string;
    required?: Record<string, ConfigField>;
    services?: ServiceDefinition[];
    meshIntegration?: any;
    providesEndpoint?: boolean;
    impact?: 'minimal' | 'moderate' | 'significant';
    removable?: boolean;
    defaultEnabled?: boolean;
}

export interface ConfigField {
    type: 'string' | 'url' | 'password' | 'number' | 'boolean';
    label: string;
    placeholder?: string;
    default?: string | number | boolean;
    validation?: string;
}

export interface ServiceDefinition {
    id: string;
    name: string;
    required?: boolean;
    endpoint?: string;
    requiresApiKey?: boolean;
}

export interface ComponentRegistry {
    version: string;
    components: {
        frontends: ComponentDefinition[];
        backends: ComponentDefinition[];
        dependencies: ComponentDefinition[];
        externalSystems?: ComponentDefinition[];
        appBuilder?: ComponentDefinition[];
    };
    compatibilityMatrix?: Record<string, Record<string, CompatibilityInfo>>;
    presets?: PresetDefinition[];
}

export interface CompatibilityInfo {
    compatible: boolean;
    recommended?: boolean;
    notes?: string;
}

export interface PresetDefinition {
    id: string;
    name: string;
    description?: string;
    selections: {
        frontend: string;
        backend: string;
        dependencies: string[];
    };
}

export interface StateData {
    version: number;
    currentProject?: Project;
    processes: Map<string, ProcessInfo>;
    lastUpdated: Date;
}

export interface UpdateInfo {
    version: string;
    critical: boolean;
    downloadUrl: string;
    changelogUrl?: string;
    releaseDate: string;
    minSupportedVersion?: string;
}

export interface Prerequisites {
    fnm: {
        installed: boolean;
        version?: string;
        path?: string;
    };
    node: {
        installed: boolean;
        version?: string;
        versions: {
            v18?: string;
            v20?: string;
        };
    };
    adobeIO: {
        installed: boolean;
        version?: string;
        authenticated: boolean;
    };
    apiMesh: {
        installed: boolean;
        version?: string;
    };
}

export interface WizardStep {
    id: string;
    title: string;
    description: string;
    validate?: () => Promise<ValidationResult>;
    execute: () => Promise<void>;
    rollback?: () => Promise<void>;
}