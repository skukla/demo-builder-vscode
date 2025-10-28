// Shared types for the webview application

// Import shared types from extension
import type {
    ComponentInstance,
    AdobeConfig,
    CommerceConfig,
    Project,
    ProjectTemplate
} from '@/core/ui/types';

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
    | 'project-creation';

export interface WizardState {
    currentStep: WizardStep;
    projectName: string;
    projectTemplate: ProjectTemplate;
    components?: ComponentSelection;
    componentConfigs?: ComponentConfigs;  // Component-specific environment configurations
    adobeAuth: AdobeAuthState;
    adobeOrg?: Organization;  // Renamed for consistency
    adobeProject?: AdobeProject;  // Renamed for consistency
    adobeWorkspace?: Workspace;  // New field for workspace
    commerceConfig?: WizardCommerceConfig;  // Wizard-specific commerce config (simplified)
    creationProgress?: CreationProgress;
    projectSearchFilter?: string;  // Filter persistence for project selection

    // Persistent caches to prevent re-fetching on backward navigation
    projectsCache?: AdobeProject[];
    workspacesCache?: Workspace[];
    organizationsCache?: Organization[];
    
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
        meshStatus?: 'deployed' | 'not-deployed' | 'pending' | 'error';
        endpoint?: string;
        error?: string;
        setupInstructions?: Array<{ step: string; details: string; important?: boolean }>;
    };
}

export interface AdobeAuthState {
    isAuthenticated: boolean;
    isChecking: boolean;
    email?: string;
    error?: string;
    requiresOrgSelection?: boolean;
    orgLacksAccess?: boolean;  // Selected organization doesn't have App Builder access
}

// Re-export Adobe entity types from centralized location
export type { Organization, AdobeProject, Workspace } from '@/core/ui/types';

// Re-export shared types for convenience
export type { ComponentInstance, AdobeConfig, CommerceConfig, Project, ProjectTemplate };

// Wizard-specific simplified commerce config (different from full CommerceConfig in @/types)
export interface WizardCommerceConfig {
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

export interface FormValidation {
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