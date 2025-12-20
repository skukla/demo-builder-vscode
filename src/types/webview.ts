// Shared types for the webview application

import { ErrorCode } from './errorCodes';

export type ThemeMode = 'light' | 'dark';

export type WizardStep =
    | 'welcome'
    | 'component-selection'
    | 'prerequisites'
    | 'adobe-setup'  // Kept for backward compatibility
    | 'adobe-auth'  // Adobe authentication step
    | 'adobe-project'  // Adobe project selection step
    | 'adobe-workspace'  // Adobe workspace selection step
    | 'adobe-context'  // Kept for compatibility
    | 'org-selection'  // Kept for compatibility, will be disabled in config
    | 'project-selection'  // Kept for compatibility, will be disabled in config
    | 'eds-github'  // EDS: GitHub authentication (conditional: requiresGitHub stack)
    | 'eds-repository-config'  // EDS: Repository and DA.live configuration (conditional: requiresGitHub stack)
    | 'eds-data-source'  // EDS: ACCS data source configuration (conditional: requiresDaLive stack)
    | 'settings'  // Component-specific settings collection
    | 'commerce-config'  // Kept for compatibility
    | 'review'
    | 'project-creation';
    // Note: 'api-mesh' and 'mesh-deployment' removed - mesh deployment now in Project Creation Phase 3

export interface WizardState {
    currentStep: WizardStep;
    projectName: string;
    selectedTemplate?: string;  // Selected demo template ID (e.g., 'citisignal')
    selectedBrand?: string;  // Selected brand ID (e.g., 'citisignal', 'default', 'buildright')
    selectedStack?: string;  // Selected stack ID (e.g., 'headless', 'edge-delivery')
    selectedAddons?: string[];  // Selected addon IDs (e.g., ['adobe-commerce-aco'])
    brandConfigDefaults?: Record<string, string>;  // Brand-specific config defaults (e.g., store codes)
    components?: ComponentSelection;
    componentConfigs?: ComponentConfigs;  // Component-specific environment configurations
    adobeAuth: AdobeAuthState;
    adobeOrg?: Organization;  // Renamed for consistency
    adobeProject?: AdobeProject;  // Renamed for consistency
    adobeWorkspace?: Workspace;  // New field for workspace
    commerceConfig?: WizardCommerceConfig;  // Wizard-specific commerce config (simplified)
    creationProgress?: CreationProgress;
    projectSearchFilter?: string;  // Filter persistence for project selection
    edsConfig?: EDSConfig;  // EDS (Edge Delivery Services) configuration

    // Persistent caches to prevent re-fetching on backward navigation
    projectsCache?: AdobeProject[];
    workspacesCache?: Workspace[];
    organizationsCache?: Organization[];
    githubReposCache?: GitHubRepoItem[];  // GitHub repos with write access
    githubRepoSearchFilter?: string;  // Search filter for repo selection
    
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
    editOriginalName?: string;  // Original project name (for duplicate validation)
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

/**
 * GitHub repository item for selection UI
 * Uses string ID for useSelectionStep compatibility
 */
export interface GitHubRepoItem {
    /** String ID for selection (repo fullName) */
    id: string;
    /** Repository name (without owner) */
    name: string;
    /** Full repository name (owner/repo) - same as id */
    fullName: string;
    /** Repository description */
    description?: string | null;
    /** Last updated timestamp */
    updatedAt?: string;
    /** Whether repository is private */
    isPrivate?: boolean;
    /** GitHub web URL */
    htmlUrl?: string;
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

/** Status of mesh deployment during project creation Phase 3 */
export type MeshPhaseStatus = 'deploying' | 'verifying' | 'timeout' | 'error' | 'success';

/** Mesh deployment state for Phase 3 UI */
export interface MeshPhaseState {
    status: MeshPhaseStatus;
    attempt: number;
    maxAttempts: number;
    elapsedSeconds: number;
    message?: string;
    endpoint?: string;
    errorMessage?: string;
}

export interface CreationProgress {
    currentOperation: string;
    progress: number;
    message: string;
    logs: string[];
    error?: string;
    /** Mesh deployment state - present during Phase 3 when mesh is being deployed */
    meshPhase?: MeshPhaseState;
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

/**
 * EDS (Edge Delivery Services) configuration for wizard
 * Contains ACCS credentials, GitHub auth state, and DA.live settings
 */
export interface EDSConfig {
    /** ACCS host URL (must start with https://) */
    accsHost: string;
    /** Store view code for ACCS */
    storeViewCode: string;
    /** Customer group for ACCS */
    customerGroup: string;
    /** Data source selection */
    dataSource?: 'citisignal-electronics' | 'citisignal-fashion' | 'custom';
    /** Whether ACCS credentials have been validated */
    accsValidated?: boolean;
    /** ACCS validation error message */
    accsValidationError?: string;
    /** GitHub authentication state */
    githubAuth?: {
        isAuthenticated: boolean;
        isAuthenticating?: boolean;
        user?: { login: string; avatarUrl?: string; email?: string };
        error?: string;
    };
    /** Repository mode: create new or use existing */
    repoMode?: 'new' | 'existing';
    /** GitHub repository name (for new repos) */
    repoName: string;
    /** Selected existing repository (from searchable list) */
    selectedRepo?: GitHubRepoItem;
    /** Existing repository full name (owner/repo format) - deprecated, use selectedRepo */
    existingRepo?: string;
    /** Whether existing repo access has been verified - deprecated, use selectedRepo */
    existingRepoVerified?: boolean;
    /** Whether to reset existing repo to template (repurpose flow) */
    resetToTemplate?: boolean;
    /** DA.live organization name */
    daLiveOrg: string;
    /** Whether DA.live org access has been verified */
    daLiveOrgVerified?: boolean;
    /** DA.live org verification error */
    daLiveOrgError?: string;
    /** DA.live site name */
    daLiveSite: string;
}