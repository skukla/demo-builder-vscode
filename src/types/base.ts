/**
 * Base Type Definitions
 *
 * Core types used across the extension. This file contains primitive types
 * that don't depend on other type files, breaking circular dependencies.
 */

import type { CustomBlockLibrary, InstalledBlockLibrary } from './blockLibraries';
import type { ServiceDefinition } from './components';

/**
 * AiPrompt - A user-saved AI prompt
 *
 * Storage is scope-routed by the `pinned` field. Pinned prompts persist in
 * VS Code globalState under `demoBuilder.ai.globalPrompts` and appear in
 * every project. Unpinned prompts persist in the current project's
 * `.demo-builder.json` manifest under `Project.aiPrompts` and stay
 * project-specific. Toggling pin moves the prompt across stores.
 *
 * Legacy data: prompts pinned before the global-pin feature shipped remain
 * in their project's manifest until the user manually unpins then re-pins
 * them — no automatic migration.
 *
 * Array order within either store is preserved; render-time pinned-first
 * sort happens in the UI layer.
 */
export interface AiPrompt {
    id: string;
    title: string;
    prompt: string;
    /**
     * When true: the prompt lives in globalState and appears in every
     * project; render-time sort floats it above unpinned prompts.
     * When falsy: project-scoped, visible only in the current project.
     */
    pinned?: boolean;
}

/**
 * Project - Core project definition
 */
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
    // Component-based structure
    componentInstances?: Record<string, ComponentInstance>;
    // Component selections (which components were chosen)
    componentSelections?: {
        frontend?: string;  // Component ID
        backend?: string;   // Component ID
        dependencies?: string[]; // Component IDs
        integrations?: string[]; // Component IDs
        appBuilder?: string[]; // Component IDs
    };
    // Component configurations (environment variables and settings)
    componentConfigs?: Record<string, Record<string, string | boolean | number | undefined>>;
    // Package/Stack/Addons selections (vertical + architecture)
    /** Package ID selected during project creation (e.g., 'citisignal', 'buildright') */
    selectedPackage?: string;
    /** Stack ID selected during project creation (e.g., 'headless-paas') */
    selectedStack?: string;
    /** Optional addons selected during project creation (e.g., ['adobe-commerce-aco']) */
    selectedAddons?: string[];
    /** Block library IDs selected during project creation (e.g., ['isle5', 'demo-team-blocks']) */
    selectedBlockLibraries?: string[];
    /** Custom block libraries added by URL */
    customBlockLibraries?: CustomBlockLibrary[];
    /** Installed block library snapshot — source commit SHA captured at install time */
    installedBlockLibraries?: InstalledBlockLibrary[];
    /** Installed Demo Inspector SDK version tracking */
    installedInspectorSdk?: {
        /** Commit SHA of the SDK repo at install time */
        commitSha: string;
        /** ISO date string when SDK was installed */
        installedAt: string;
    };
    // Mesh staleness summary for card grid display
    meshStatusSummary?: 'deployed' | 'stale' | 'config-incomplete' | 'update-declined' | 'not-deployed' | 'error' | 'unknown';
    // API Mesh deployment state (tracks changes that require redeployment)
    // AUTHORITATIVE location for mesh endpoint - see docs/architecture/state-ownership.md
    meshState?: {
        envVars: Record<string, string>;
        sourceHash: string | null;
        lastDeployed: string; // ISO date string
        endpoint?: string; // AUTHORITATIVE mesh GraphQL endpoint URL
        userDeclinedUpdate?: boolean; // User clicked "Later" on redeploy prompt
        declinedAt?: string; // ISO date string when user declined
    };
    // EDS Storefront config.json state (tracks changes that require republishing)
    edsStorefrontState?: {
        envVars: Record<string, string>; // Env vars at last publish
        lastPublished: string; // ISO date string
        userDeclinedUpdate?: boolean; // User clicked "Later" on republish prompt
        declinedAt?: string; // ISO date string when user declined
    };
    // EDS Storefront status summary for card grid display
    edsStorefrontStatusSummary?: 'published' | 'stale' | 'update-declined' | 'not-published';
    /**
     * Resolved AEM authoring experience for the projects-list card grid.
     *
     * UI-only enrichment computed backend-side (via resolveProjectAuthoringExperience)
     * so the webview stays presentational — it never imports the resolver or
     * `vscode`. Drives the "Author in …" label and the kebab flip control.
     */
    resolvedAuthoringExperience?: AuthoringExperience;
    // Frontend config state (tracks changes since demo started)
    frontendEnvState?: {
        envVars: Record<string, string>;
        capturedAt: string; // ISO date string
    };
    // Component version tracking (for updates)
    componentVersions?: Record<string, {
            version: string;
            lastUpdated: string; // ISO date string
        }>;
    /** User-saved AI prompts */
    aiPrompts?: AiPrompt[];
    /**
     * Pinned projects sort first on the projects dashboard (alphabetical
     * within the pinned and unpinned groups). Set per-project via the
     * Pin/Unpin kebab item.
     */
    pinned?: boolean;
    // Aliases for compatibility
    createdAt?: Date;
    updatedAt?: Date;
}

export interface CustomIconPaths {
    light: string;           // Path to icon for light theme
    dark: string;            // Path to icon for dark theme
}

/**
 * AEM authoring experience for an EDS project.
 *
 * Stored per-project on the EDS component-instance metadata as
 * `authoringExperience` (beside `daLiveOrg`/`daLiveSite`). Absence falls back
 * to the global `demoBuilder.daLive.authoringExperience` setting (default
 * 'da-live-classic'). Resolved via resolveAuthoringExperience in edsHelpers.
 */
export type AuthoringExperience = 'da-live-classic' | 'experience-workspace';

export interface ComponentInstance {
    id: string;              // Component ID (e.g., "headless")
    name: string;            // Human-readable name
    type?: 'frontend' | 'backend' | 'dependency' | 'external-system' | 'app-builder'; // Legacy field, not used with selectionGroups
    subType?: 'mesh' | 'utility' | 'service';
    icon?: string | CustomIconPaths;  // VSCode ThemeIcon name OR custom icon paths
    path?: string;           // Full path to cloned repo (if applicable)
    repoUrl?: string;        // Git repository URL
    branch?: string;         // Current branch
    version?: string;        // Version/commit hash
    status: ComponentStatus;
    port?: number;           // For components that run locally
    pid?: number;            // Process ID if running
    lastUpdated?: Date;
    metadata?: Record<string, unknown>; // Additional component-specific data
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
    | 'resetting'     // Transitional: EDS project is being reset
    | 'republishing'  // Transitional: EDS project content is being republished
    | 'error';

export interface AdobeConfig {
    projectId: string;
    projectName: string;
    /** Human-readable project title (preferred for display) */
    projectTitle?: string;
    organization: string;
    workspace: string;
    /** Human-readable workspace title (preferred for display) */
    workspaceTitle?: string;
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
}

export interface ProcessInfo {
    pid: number;
    port: number;
    startTime: Date;
    command: string;
    status: 'running' | 'stopped' | 'error';
}

export interface ComponentDefinition {
    id: string;
    name: string;
    type?: 'frontend' | 'backend' | 'dependency' | 'external-system' | 'app-builder'; // Legacy field, not used with selectionGroups
    subType?: 'mesh' | 'utility' | 'service';
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

export interface ConfigField {
    type: 'string' | 'url' | 'password' | 'number' | 'boolean';
    label: string;
    placeholder?: string;
    default?: string | number | boolean;
    validation?: string;
}

export interface ComponentConfiguration {
    envVars?: string[];
    port?: number;
    nodeVersion?: string;
    buildScript?: string;  // npm script to run after install (e.g., "build")
    skipNpmInstall?: boolean;  // Skip npm install after update (e.g., EDS storefronts)
    required?: Record<string, ConfigField>;
    services?: ServiceDefinition[];
    meshIntegration?: {
        sources?: Record<string, unknown>;
        handlers?: Record<string, unknown>;
    };
    providesEndpoint?: boolean;
    impact?: 'minimal' | 'moderate' | 'significant';
    removable?: boolean;
    defaultEnabled?: boolean;
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
