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
    type: 'frontend' | 'mesh' | 'inspector' | 'app-builder' | 'custom';
    source: {
        type: 'git' | 'npm' | 'local';
        url: string;
    };
    configuration?: {
        envVars?: string[];
        meshIntegration?: any;
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