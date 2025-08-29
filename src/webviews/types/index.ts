// Shared types for the webview application

export type ThemeMode = 'light' | 'dark';

export type WizardStep = 
    | 'welcome'
    | 'component-selection'
    | 'prerequisites'
    | 'adobe-auth'
    | 'org-selection'
    | 'project-selection'
    | 'commerce-config'
    | 'review'
    | 'creating';

export interface WizardState {
    currentStep: WizardStep;
    projectName: string;
    projectTemplate: ProjectTemplate;
    components?: ComponentSelection;
    adobeAuth: AdobeAuthState;
    organization?: Organization;
    project?: Project;
    commerceConfig?: CommerceConfig;
    creationProgress?: CreationProgress;
}

export type ProjectTemplate = 'commerce-paas' | 'commerce-saas' | 'aem-commerce';

export interface AdobeAuthState {
    isAuthenticated: boolean;
    isChecking: boolean;
    email?: string;
    error?: string;
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
}

export interface ComponentSelection {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    preset?: string;
}