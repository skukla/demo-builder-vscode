/**
 * Webview REQUEST payloads — the wire shapes for messages a webview sends TO
 * the extension (the request direction). The push direction lives in
 * `./webviewPayloads`; same rules apply here:
 *
 * - ONE declaration per channel, imported by BOTH the sender (webview) and
 *   the handler (extension), so drift fails the build instead of the feature.
 * - This module must NEVER import `vscode` — it compiles into the browser
 *   bundles.
 * - Types state the WIRE truth: `null` stays `null`, required means the
 *   sender always includes it; each side converts at its own edge.
 *
 * @module types/webviewRequests
 */

import type { AdobeConfig } from './base';
import type { CustomBlockLibrary } from './blockLibraries';
import type { CommerceStoreStructure } from './commerceStore';
import type { ComponentConfigs, EnvVarDefinition, ServiceDefinition } from './components';
import type { GitHubRepoItem } from './webview';
import type { GitHubUser } from './webviewPayloads';

/**
 * Frontend source from template (same shape as TemplateSource)
 */
export interface FrontendSource {
    type: string;
    url: string;
    branch: string;
    gitOptions?: {
        shallow?: boolean;
    };
}

/**
 * `create-project` — the full project-creation request. Built by the
 * wizard's `buildProjectConfig` (and the MCP create_project tool),
 * consumed by `executeProjectCreation`.
 */
export interface ProjectCreationConfig {
    /** The SLUG — folder name and dedupe key. */
    projectName: string;
    /** What the user typed. Absent for a project with no title set. */
    projectTitle?: string;
    adobe?: AdobeConfig;
    components?: {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        integrations?: string[];
        appBuilder?: string[];
    };
    componentConfigs?: ComponentConfigs;
    /** The discovered Commerce store hierarchy (names for the chosen codes). */
    commerceStoreStructure?: CommerceStoreStructure;
    apiMesh?: {
        meshId?: string;
        endpoint?: string;
        meshStatus?: string;
        workspace?: string;
    };
    // For detecting same-workspace imports to skip mesh deployment
    importedWorkspaceId?: string;
    importedMeshEndpoint?: string;
    // Package/Stack selections
    selectedPackage?: string;
    datapack?: { name: string; version: string };
    selectedStack?: string;
    // Selected App Builder integration ids (Model B deploy) + custom GitHub sources
    selectedAppBuilderComponents?: string[];
    appBuilderComponentSources?: Record<
        string,
        { owner: string; repo: string; branch?: string; name?: string }
    >;
    // Free Console API picks (union across integrations) — persisted on the Project
    // so Phase 3b's subscribe union covers them. LEGACY: derived from the keyed
    // record below, which is the durable, attributed form.
    additionalConsoleApis?: string[];
    // The same picks keyed by integration id — what resolveDesiredApis unions.
    componentApiPicks?: Record<string, string[]>;
    // Selected optional addons (e.g., ['adobe-commerce-aco'])
    selectedAddons?: string[];
    // Selected block library IDs (e.g., ['isle5', 'demo-team-blocks'])
    selectedBlockLibraries?: string[];
    // Custom block libraries added by URL
    customBlockLibraries?: CustomBlockLibrary[];
    // Frontend source from template (templates are source of truth for repos)
    frontendSource?: FrontendSource;
    // Edit mode: re-use existing project directory (editProjectPath presence signals edit mode)
    editProjectPath?: string;
    // EDS-specific configuration (for Edge Delivery Services stacks)
    edsConfig?: {
        repoName: string;
        repoMode: 'new' | 'existing';
        existingRepo?: string;
        resetToTemplate?: boolean;
        daLiveOrg: string;
        daLiveSite: string;
        accsEndpoint?: string;
        githubOwner?: string;
        isPrivate?: boolean;
        skipContent?: boolean;
        skipTools?: boolean;
        // Template source repo (from frontendSource) for GitHub reset operations
        templateOwner?: string;
        templateRepo?: string;
        // DA.live content source (explicit config, not derived from GitHub)
        contentSource?: {
            org: string;
            site: string;
            indexPath?: string;
        };
        // Second content source for the account chrome (hybrid packages).
        accountContentSource?: {
            org: string;
            site: string;
        };
        // Preflight completion fields (set by StorefrontSetupStep)
        preflightComplete?: boolean;
        repoUrl?: string;
        // Note: previewUrl/liveUrl not stored - derived from githubRepo by typeGuards
        // Patch IDs to apply during reset (from demo-packages.json)
        patches?: string[];
        // Content patch IDs to apply during DA.live content copy
        contentPatches?: string[];
        // External source for content patches (from demo-packages.json)
        contentPatchSource?: {
            owner: string;
            repo: string;
            path: string;
        };
        // Code patch IDs to apply (canonical + block) — Step 5 populates these.
        codePatches?: string[];
        // External source for code patches (e.g., skukla/eds-demo-patches/citisignal).
        // When set, the storefront is "thin-layer": `lastSyncedCommit` records the
        // verified canonical LKG SHA (per ADR-006 D2) rather than the template
        // repo's `main` HEAD, so "is there an update?" means "did the LKG pointer
        // advance?" not "is canonical main ahead of where we created?".
        codePatchSource?: {
            owner: string;
            repo: string;
            path: string;
            /** Per-ledger LKG file when the ledger tracks a non-default canonical
             *  (e.g., b2b's B2B template). Omitted for ledgers sharing the
             *  default root `last-known-good`. */
            lkgFile?: string;
        };
    };
}

/**
 * One component entry as the `get-components-data` response carries it —
 * the DTO `toComponentDataArray` builds from the registry. Moved here from
 * features/components/services/componentTransforms so the request/response
 * pair and the transformer share ONE declaration (the transformer module
 * re-exports it).
 */
export interface ComponentDataDTO {
    id: string;
    name: string;
    description?: string;
    features?: string[];
    dependencies?: {
        required?: string[];
        optional?: string[];
    };
    /** Passed through from the registry entry; the named fields are the ones consumers dispatch on. */
    configuration?: {
        requiredEnvVars?: string[];
        optionalEnvVars?: string[];
        requiredServices?: string[];
        requiresDeployment?: boolean;
        deploymentTarget?: string;
        [key: string]: unknown;
    };
    recommended?: boolean;
}

/** The `data` half of the `get-components-data` response. */
export interface ComponentsDataPayload {
    frontends: ComponentDataDTO[];
    backends: ComponentDataDTO[];
    integrations: ComponentDataDTO[];
    dependencies: ComponentDataDTO[];
    mesh: ComponentDataDTO[];
    /** Keyed defs with `key` injected (`withEnvVarKeys`) — the registry record omits it. */
    envVars: Record<string, EnvVarDefinition>;
    services: Record<string, ServiceDefinition>;
}

/**
 * `get-components-data` — the wizard's registry read (success shape; failures
 * come back as the standard `{success: false, error}` handler envelope).
 */
export interface GetComponentsDataResponse {
    success: true;
    type: 'components-data';
    data: ComponentsDataPayload;
}

/**
 * Partial state tracking for storefront setup operations
 * Tracks which resources have been created for cleanup on cancel
 */
export interface StorefrontSetupPartialState {
    repoCreated: boolean;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    contentCopied: boolean;
    phase: string;
}

/**
 * Payload for storefront-setup-start message
 */
export interface StorefrontSetupStartPayload {
    projectName: string;
    /** Component configurations for config.json generation */
    componentConfigs?: Record<string, Record<string, string | boolean | number | undefined>>;
    /** Backend component ID for environment-aware config generation */
    backendComponentId?: string;
    /** Effective component dependencies (stack deps + user-selected optional deps) */
    dependencies?: string[];
    /** Selected addon IDs (e.g., ['adobe-commerce-aco']) */
    selectedAddons?: string[];
    /** Selected block library IDs (e.g., ['isle5', 'demo-team-blocks']) */
    selectedBlockLibraries?: string[];
    /** Custom block libraries added by URL */
    customBlockLibraries?: CustomBlockLibrary[];
    /** Selected package ID (e.g., 'citisignal') */
    selectedPackage?: string;
    /** Selected stack ID (e.g. 'eds-accs') — needed to resolve package-derived settings */
    selectedStack?: string;
    edsConfig: {
        repoName: string;
        repoMode?: 'new' | 'existing';
        existingRepo?: string;
        daLiveOrg: string;
        daLiveSite: string;
        githubOwner?: string;
        isPrivate?: boolean;
        resetToTemplate?: boolean;
        skipContent?: boolean;
        // Template repository info (from stack/brand config) for GitHub reset operations
        templateOwner?: string;
        templateRepo?: string;
        // DA.live content source (explicit config, not derived from GitHub URL)
        contentSource?: {
            org: string;
            site: string;
            indexPath?: string;
        };
        // Second content source for the account chrome (hybrid packages).
        accountContentSource?: {
            org: string;
            site: string;
        };
        // Optional BYOM content overlay URL (from demo-packages.json storefronts)
        byomOverlayUrl?: string;
        /**
         * Why `byomOverlayUrl` resolved to nothing, as a user-facing sentence.
         *
         * Set by this handler at resolution time and read by phase 3, so the
         * phases never touch VS Code settings. Phase 3 briefly did, inside the
         * Configuration Service try/catch, where a failed config read surfaced
         * as a bogus "Config Service incomplete" warning.
         */
        byomAbsentReason?: string;
        // Selected existing repository — the wizard's own repo-list item type
        // (ONE declaration; this used to be an inline four-field twin).
        selectedRepo?: GitHubRepoItem;
        // Selected existing DA.live site (from searchable list)
        // Used to determine if user is using an existing site vs creating new
        selectedSite?: {
            id: string;
            name: string;
        };
        // Whether to reset existing site content (repopulate with demo data)
        // Only applies when selectedSite is set (existing site mode)
        resetSiteContent?: boolean;
        // Created repository info (set when the repo was created in RepoSelectionInline)
        // If present, skip repo creation in StorefrontSetupStep
        createdRepo?: {
            owner: string;
            name: string;
            url: string;
            fullName: string;
        };
        // Patch IDs to apply during setup (from demo-packages.json storefronts)
        patches?: string[];
        // Content patch IDs to apply during DA.live content copy (from demo-packages.json storefronts)
        contentPatches?: string[];
        // External source for content patches (from demo-packages.json storefronts)
        contentPatchSource?: {
            owner: string;
            repo: string;
            path: string;
        };
        // Code patch IDs to apply during create/reset (ADR-006 Step 5; sibling
        // of contentPatches, operates on repo files).
        codePatches?: string[];
        // External code-patch source (thin-layer storefronts per ADR-006).
        codePatchSource?: {
            owner: string;
            repo: string;
            path: string;
        };
        // Additive brand files + optional marker-bounded head.html snippet
        // (from demo-packages.json storefronts), vendored by brandAssetPublisher.
        brandAssets?: {
            source: { owner: string; repo: string; branch: string };
            files: Array<{ from: string; to: string }>;
            headSnippet?: string;
        };
        // GitHub auth info from Connect Services step
        // The wizard's auth slice rides along; the phases read user.login /
        // user.email. ONE GitHubUser declaration (nullable fields — this used
        // to be the optional-strings twin the push audit already killed twice).
        githubAuth?: {
            isAuthenticated: boolean;
            user?: GitHubUser;
        };
    };
}

/**
 * Payload for storefront-setup-cancel message
 */
export interface StorefrontSetupCancelPayload {
    partialState?: StorefrontSetupPartialState;
    edsConfig?: {
        daLiveOrg?: string;
        daLiveSite?: string;
    };
}

/**
 * `check-prerequisites` — run the full prerequisite check for a stack.
 */
export interface CheckPrerequisitesRequestPayload {
    selectedStack?: string;
    /** Clear the cache and re-run every check from scratch. */
    isRecheck?: boolean;
    selectedOptionalDependencies?: string[];
}

/** `continue-prerequisites` — resume checking after an install, from a row index. */
export interface ContinuePrerequisitesRequestPayload {
    fromIndex?: number;
}

/**
 * `install-prerequisite` — install one prerequisite. The webview names the
 * target by numeric row index (`prereqId`); the MCP surface names it by the
 * stable string id (`prerequisiteId`).
 */
export interface InstallPrerequisiteRequestPayload {
    prereqId?: number;
    prerequisiteId?: string;
    version?: string;
}

/** A destination entity reference (id + display fields) for setProjectDestination. */
export interface DestinationRef {
    id: string;
    name?: string;
    title?: string;
}

/** `setProjectDestination` — persist the Adobe project/workspace integrations deploy to. */
export interface SetProjectDestinationRequestPayload {
    project?: DestinationRef;
    workspace?: DestinationRef;
}

/**
 * `addAppBuilderComponent` — add (and deploy) an App Builder integration on a
 * live project: a catalog entry by `id`, or a custom source by owner/repo.
 */
export interface AddAppBuilderComponentRequestPayload {
    id?: string;
    source?: { owner: string; repo: string };
    /** Display name for a named blank instance (the flow's naming step). */
    name?: string;
    /** Collision-checked instance id for a named blank instance. */
    instanceId?: string;
    /**
     * The free Adobe APIs the user picked in the flow's API stage.
     *
     * These MUST land on the project before the runner runs: the subscribe union
     * is `resolveDesiredApis(project)`, so a pick that is not persisted is never
     * subscribed. The dashboard flow used to write them into WIZARD state, which
     * the dashboard never persists — the picks were silently dropped, the API was
     * not subscribed, and Manage APIs opened with nothing checked (2026-08-04).
     */
    apis?: string[];
}









