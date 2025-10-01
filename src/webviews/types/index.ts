// Shared types for the webview application

export type ThemeMode = 'light' | 'dark';

export type WizardStep = 
    | 'welcome'
    | 'component-selection'
    | 'prerequisites'
    | 'adobe-setup'  // Kept for backward compatibility
    | 'adobe-auth'  // Adobe authentication step
    | 'adobe-project'  // Adobe project selection step
    | 'adobe-workspace'  // Adobe workspace selection step
    | 'api-mesh'  // API Mesh verification and setup step
    | 'adobe-context'  // Kept for compatibility
    | 'org-selection'  // Kept for compatibility, will be disabled in config
    | 'project-selection'  // Kept for compatibility, will be disabled in config
    | 'settings'  // Component-specific settings collection
    | 'commerce-config'  // Kept for compatibility
    | 'review'
    | 'creating';

export interface WizardState {
    currentStep: WizardStep;
    projectName: string;
    projectTemplate: ProjectTemplate;
    components?: ComponentSelection;
    componentConfigs?: ComponentConfigs;  // Component-specific environment configurations
    adobeAuth: AdobeAuthState;
    adobeOrg?: Organization;  // Renamed for consistency
    adobeProject?: Project;  // Renamed for consistency
    adobeWorkspace?: Workspace;  // New field for workspace
    commerceConfig?: CommerceConfig;  // Kept for compatibility
    creationProgress?: CreationProgress;
    projectSearchFilter?: string;  // Filter persistence for project selection
    apiVerification?: {
        isChecking: boolean;
        message?: string;
        subMessage?: string;
        hasMesh?: boolean;
        error?: string;
    };
    apiMesh?: {
        isChecking: boolean;
        message?: string;
        subMessage?: string;
        apiEnabled: boolean;
        meshExists: boolean;
        meshId?: string;
        meshStatus?: 'deployed' | 'not-deployed' | 'pending';
        endpoint?: string;
        error?: string;
    };
}

export type ProjectTemplate = 'commerce-paas' | 'commerce-saas' | 'aem-commerce';

export interface AdobeAuthState {
    isAuthenticated: boolean;
    isChecking: boolean;
    email?: string;
    error?: string;
    requiresOrgSelection?: boolean;
}

export interface Organization {
    id: string;
    code: string;
    name: string;
}

export interface Project {
    id: string;
    name: string;
    title?: string;
    description?: string;
}

export interface Workspace {
    id: string;
    name: string;
    title?: string;
}

export interface CommerceConfig {
    url: string;
    environmentId: string;
    storeCode: string;
    storeView: string;
    catalogApiKey?: string;
    searchApiKey?: string;
}

export interface CreationProgress {
    currentOperation: string;
    progress: number;
    message: string;
    logs: string[];
    error?: string;
}

export interface FeedbackMessage {
    step: string;
    status: 'start' | 'progress' | 'complete' | 'error' | 'warning';
    primary: string;
    secondary?: string;
    progress?: number;
    log?: string;
    error?: string;
    canRetry?: boolean;
}

export interface ValidationResult {
    isValid: boolean;
    message?: string;
    field: string;
}

export interface UnifiedProgress {
    overall: {
        percent: number;
        currentStep: number;
        totalSteps: number;
        stepName: string;
    };
    command?: {
        type: 'determinate' | 'indeterminate';
        percent?: number;
        detail?: string;
        confidence: 'exact' | 'estimated' | 'synthetic';
    };
}

export interface PrerequisiteCheck {
    id?: string;
    name: string;
    description: string;
    status: 'pending' | 'checking' | 'success' | 'error' | 'warning';
    message?: string;
    canInstall?: boolean;
    isOptional?: boolean;
    version?: string;
    plugins?: Array<{
        id: string;
        name: string;
        description?: string;
        installed: boolean;
        canInstall?: boolean;
    }>;
    unifiedProgress?: UnifiedProgress;
    nodeVersionStatus?: Array<{
        version: string;
        component: string;
        installed: boolean;
    }>;
}

export interface ComponentSelection {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    services?: string[];
    externalSystems?: string[];
    appBuilderApps?: string[];
    preset?: string;
}

export interface ComponentConfigs {
    [componentId: string]: ComponentConfig;
}

export interface ComponentConfig {
    [key: string]: string | boolean | number | undefined;
}

export interface ComponentEnvVar {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'select' | 'boolean';
    required?: boolean;
    default?: string | boolean;
    placeholder?: string;
    description?: string;
    helpText?: string;
    group?: string;
    providedBy?: string;
    usedBy?: string[];
    options?: Array<{ value: string; label: string }>;
    validation?: {
        pattern?: string;
        message?: string;
    };
}