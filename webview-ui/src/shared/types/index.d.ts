import type { ComponentInstance, AdobeConfig, CommerceConfig, Project, ProjectTemplate } from '@/types';
export type ThemeMode = 'light' | 'dark';
export type WizardStep = 'welcome' | 'component-selection' | 'prerequisites' | 'adobe-setup' | 'adobe-auth' | 'adobe-project' | 'adobe-workspace' | 'api-mesh' | 'adobe-context' | 'org-selection' | 'project-selection' | 'settings' | 'commerce-config' | 'review' | 'project-creation';
export interface WizardState {
    currentStep: WizardStep;
    projectName: string;
    projectTemplate: ProjectTemplate;
    components?: ComponentSelection;
    componentConfigs?: ComponentConfigs;
    adobeAuth: AdobeAuthState;
    adobeOrg?: Organization;
    adobeProject?: AdobeProject;
    adobeWorkspace?: Workspace;
    commerceConfig?: WizardCommerceConfig;
    creationProgress?: CreationProgress;
    projectSearchFilter?: string;
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
        setupInstructions?: Array<{
            step: string;
            details: string;
            important?: boolean;
        }>;
    };
}
export interface AdobeAuthState {
    isAuthenticated: boolean;
    isChecking: boolean;
    email?: string;
    error?: string;
    requiresOrgSelection?: boolean;
    orgLacksAccess?: boolean;
}
export interface Organization {
    id: string;
    code: string;
    name: string;
}
export interface AdobeProject {
    id: string;
    name: string;
    title?: string;
    description?: string;
    org_id?: number;
}
export type { ComponentInstance, AdobeConfig, CommerceConfig, Project, ProjectTemplate };
export interface Workspace {
    id: string;
    name: string;
    title?: string;
}
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
    options?: Array<{
        value: string;
        label: string;
    }>;
    validation?: {
        pattern?: string;
        message?: string;
    };
}
//# sourceMappingURL=index.d.ts.map