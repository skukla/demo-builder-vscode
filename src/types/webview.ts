// Shared types for the webview application

import { ErrorCode } from './errorCodes';

export type ThemeMode = 'light' | 'dark';

// Re-export types needed from extension (avoiding circular dependency)
export type ProjectTemplate = 'citisignal' | 'blank' | 'custom';

export type WizardStep =
    | 'welcome'
    | 'component-selection'
    | 'prerequisites'
    | 'adobe-setup'  // Kept for backward compatibility
    | 'adobe-auth'  // Adobe authentication step
    | 'adobe-project'  // Adobe project selection step
    | 'adobe-workspace'  // Adobe workspace selection step
    | 'api-mesh'  // API Mesh verification and setup step
    | 'mesh-deployment'  // Mesh deployment with timeout recovery (PM Decision 2025-12-06)
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
        code?: ErrorCode;  // Typed error code for programmatic handling
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
        code?: ErrorCode;  // Typed error code for programmatic handling
        setupInstructions?: Array<{ step: string; details: string; important?: boolean }>;
    };

    // Edit mode properties
    editMode?: boolean;  // True when editing existing project
    editProjectPath?: string;  // Path to existing project being edited
}

export interface AdobeAuthState {
    isAuthenticated: boolean;
    isChecking: boolean;
    email?: string;
    error?: string;
    code?: ErrorCode;  // Typed error code for programmatic handling
    requiresOrgSelection?: boolean;
    orgLacksAccess?: boolean;  // Selected organization doesn't have App Builder access
    tokenExpiresIn?: number;  // Minutes until token expires
    tokenExpiringSoon?: boolean;  // True if < 5 minutes remaining
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
    org_id?: string;  // Organization ID from Adobe Console API
}

// Note: Import shared types from @/types directly where needed (removed circular re-export)

export interface Workspace {
    id: string;
    name: string;
    title?: string;
}

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

/**
 * Unified progress reporting interface for prerequisite operations.
 *
 * Supports both overall step progress and granular command-level progress,
 * including milestone tracking for multi-step operations.
 */
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

        /**
         * Current milestone index (0-based) for multi-step operations.
         * Used with totalMilestones to display substep progress like "Step 2 of 3".
         * Only present when an operation has multiple milestones.
         */
        currentMilestoneIndex?: number;

        /**
         * Total number of milestones in the current operation.
         * Used with currentMilestoneIndex to display substep progress.
         */
        totalMilestones?: number;
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
    integrations?: string[];
    appBuilderApps?: string[];
    preset?: string;
}

export interface ComponentConfigs {
    [componentId: string]: ComponentConfig;
}

export interface ComponentConfig {
    [key: string]: string | boolean | number | undefined;
}

/**
 * A single step in field help instructions
 */
export interface FieldHelpStep {
    /** Step instruction text */
    text: string;
    /** Screenshot image filename (relative to media/help/) */
    screenshot?: string;
    /** Alt text for screenshot (for accessibility) */
    screenshotAlt?: string;
}

/**
 * Help content for a field - shown in modal when user clicks info icon
 */
export interface FieldHelp {
    /** Title shown in modal header */
    title?: string;
    /** Simple text explanation (for fields without step-by-step instructions) */
    text?: string;
    /** Step-by-step instructions with optional screenshots */
    steps?: FieldHelpStep[];
}

export interface ComponentEnvVar {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'select' | 'boolean';
    required?: boolean;
    default?: string | boolean;
    placeholder?: string;
    description?: string;
    /** Rich help content with optional screenshot */
    help?: FieldHelp;
    group?: string;
    providedBy?: string;
    usedBy?: string[];
    options?: Array<{ value: string; label: string }>;
    validation?: {
        pattern?: string;
        message?: string;
    };
}