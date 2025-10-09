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
    // Legacy configs (for backward compatibility)
    frontend?: FrontendConfig;
    mesh?: MeshConfig;
    inspector?: InspectorConfig;
    // New component-based structure
    componentInstances?: {
        [componentId: string]: ComponentInstance;
    };
    // Component selections (which components were chosen)
    componentSelections?: {
        frontend?: string;  // Component ID
        backend?: string;   // Component ID  
        dependencies?: string[]; // Component IDs
        externalSystems?: string[]; // Component IDs
        appBuilder?: string[]; // Component IDs
    };
    // Component configurations (environment variables and settings)
    componentConfigs?: {
        [componentId: string]: {
            [key: string]: string | boolean | number | undefined;
        };
    };
    // Aliases for compatibility
    createdAt?: Date;
    updatedAt?: Date;
}

export interface CustomIconPaths {
    light: string;           // Path to icon for light theme
    dark: string;            // Path to icon for dark theme
}

export interface ComponentInstance {
    id: string;              // Component ID (e.g., "citisignal-nextjs")
    name: string;            // Human-readable name
    type?: 'frontend' | 'backend' | 'dependency' | 'external-system' | 'app-builder'; // Legacy field, not used with selectionGroups
    subType?: 'mesh' | 'inspector' | 'utility' | 'service';
    icon?: string | CustomIconPaths;  // VSCode ThemeIcon name OR custom icon paths
    path?: string;           // Full path to cloned repo (if applicable)
    repoUrl?: string;        // Git repository URL
    branch?: string;         // Current branch
    version?: string;        // Version/commit hash
    status: ComponentStatus;
    port?: number;           // For components that run locally
    pid?: number;            // Process ID if running
    endpoint?: string;       // For deployed components (e.g., API Mesh endpoint)
    lastUpdated?: Date;
    metadata?: Record<string, any>; // Additional component-specific data
}

export type ComponentStatus = 
    | 'not-installed'
    | 'cloning'
    | 'installing'
    | 'ready'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'deploying'
    | 'deployed'
    | 'updating'
    | 'error';

export type ProjectTemplate = 
    | 'commerce-paas'
    | 'commerce-saas'
    | 'aem-commerce'
    | 'custom';

export type ProjectStatus = 
    | 'created'
    | 'configuring'
    | 'ready'
    | 'starting'      // Transitional: demo is starting up
    | 'running'
    | 'stopping'      // Transitional: demo is shutting down
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
    status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
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

export interface ComponentDefinition {
    id: string;
    name: string;
    type?: 'frontend' | 'backend' | 'dependency' | 'external-system' | 'app-builder'; // Legacy field, not used with selectionGroups
    subType?: 'mesh' | 'inspector' | 'utility' | 'service';
    icon?: string | CustomIconPaths;  // VSCode ThemeIcon name OR custom icon paths
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
    
    // Git-specific options
    gitOptions?: {
        shallow?: boolean;           // Use --depth=1 for faster clones
        recursive?: boolean;          // Clone submodules (--recursive)
        tag?: string;                 // Clone specific tag
        commit?: string;              // Clone specific commit hash
    };
    
    // Timeout configuration (milliseconds)
    timeouts?: {
        clone?: number;               // Override default clone timeout
        install?: number;             // Override default install timeout
    };
}

export interface ComponentDependencies {
    required: string[];
    optional: string[];
}

export interface ComponentConfiguration {
    envVars?: string[];
    port?: number;
    nodeVersion?: string;
    buildScript?: string;  // npm script to run after install (e.g., "build")
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
    services?: Record<string, any>;
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