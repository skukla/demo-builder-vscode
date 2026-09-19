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
import type { DaLiveContentSource } from './demoPackages';
import type { AddedDemo, RememberedDemo, SharedDemoDescription, StorefrontKind } from './projectFile';
import type { SettingsFile } from './settingsFile';
import type { GitHubRepoItem } from './webview';
import type { GitHubUser } from './webviewPayloads';

/**
 * `probe-shared-demo` — read a colleague's repository before "Add a demo package"
 * offers it (shareable-demo step 03). Owner and repo, already split by the
 * sender; the handler validates the charset.
 */
export interface ProbeSharedDemoRequest {
    owner?: string;
    repo?: string;
    /** A GitHub link or an Edge Delivery site address, read to owner/repo when those are absent. */
    link?: string;
}

/**
 * "Add a storefront from a zip file" (step 10): the host picks the file when no
 * path is given, unpacks it, creates a repository in the SC's own account and
 * pushes the files; the dialog then continues as for a link.
 */
export interface ImportStorefrontZipRequest {
    /** Absent from the webview: the host opens its file picker. */
    zipPath?: string;
    /** Defaults to the zip's root folder name. */
    repoName?: string;
    /** Public by default; clearing the dialog's tick box makes it private. */
    isPrivate?: boolean;
}

export interface ImportStorefrontZipResult {
    /** The picker was dismissed; nothing was created. */
    cancelled?: boolean;
    owner?: string;
    repo?: string;
    fullName?: string;
    /** How many files were pushed, and how many entries the zip held that a repository would not. */
    fileCount?: number;
    dropped?: number;
    isPrivate?: boolean;
    /** A demo bundle's setup part, when the zip carried one; the dialog offers to start from it. */
    setup?: SettingsFile;
}

/** Start a project from a bundle's setup, on the card its storefront became. */
export interface UseBundleSetupRequest {
    setup: SettingsFile;
    demo: AddedDemo;
}

/** Which of the storefront kinds a repository holds, or that it holds none. */
export type SharedDemoKind = StorefrontKind | 'not-a-storefront';

/** Where a value in the probe result came from, so the dialog can say what was overridden. */
export type SharedDemoValueSource = 'description-file' | 'config-json' | 'dependencies' | 'fstab';

/**
 * What `probe-shared-demo` answers. Three outcomes the dialog branches on: the
 * link is one of our own shipped templates (select that card instead, D30); the
 * repository could not be read at all; or it was read, and every field is what
 * was READ — nothing here is written anywhere. `description` is the repository's
 * own `demo.demo-builder.json` when present and readable; its values already win
 * in the other fields, and `overrides` names which ones it replaced (D10).
 */
export type SharedDemoProbeResult =
    | { outcome: 'shipped'; shippedPackageId: string; fullName: string }
    | { outcome: 'unreadable'; reason: string }
    | SharedDemoRead;

export interface SharedDemoRead {
    outcome: 'read';
    /** The repository as GitHub names it now; differs from the request after a rename. */
    fullName: string;
    defaultBranch: string;
    /** GitHub's template flag on the repository. */
    isTemplate: boolean;
    kind: SharedDemoKind;
    /** For `not-a-storefront`: the canonical files that were missing, or the reason nothing could be read. */
    missing?: string[];
    /** The DA.live site the storefront's `fstab.yaml` mounts, for an EDS storefront. */
    contentSource?: DaLiveContentSource;
    /** Whether the content site publishes an index, and how many pages it lists. */
    contentPublished: { indexFound: boolean; pageCount?: number };
    /** Store codes read from `config.json`, or from the description file's defaults. */
    storeCodes?: { websiteCode?: string; storeCode?: string; storeViewCode?: string };
    /** B2B posture and where it was read from; `unknown` when nothing said. */
    b2b: 'on' | 'off' | 'unknown';
    b2bSource?: SharedDemoValueSource;
    /** The description file's content, when the repository carries one that validates. */
    description?: SharedDemoDescription;
    /** Which read values the description file replaced, in the result's field names. */
    overrides: string[];
    /** Things the SC should hear, in plain words. */
    warnings: string[];
}

/**
 * `add-shared-demo` — the dialog's "Add demo" commit: remember the row as the
 * dialog built it from the probe. Nothing is created on GitHub (no copy since
 * 2026-09-14, shareable-demo step 11).
 */
export interface AddSharedDemoRequest {
    demo: RememberedDemo;
}

export interface AddSharedDemoResult {
    /** The remembered card. */
    demo: RememberedDemo;
}

/**
 * `forget-added-demo` — take a demo off your Welcome step. The host asks
 * for confirmation itself (it knows how many projects on this computer were
 * built on the demo) and, when the remembered card's repository was made from
 * a zip and is still the SC's own, offers to delete it too (off by default,
 * confirmed twice).
 */
export interface ForgetAddedDemoRequest {
    name: string;
    source: { owner: string; repo: string };
}

export interface ForgetAddedDemoResult {
    /** False when the SC cancelled at the confirmation. */
    forgotten: boolean;
    /** Set when the repository made from the zip was deleted from GitHub as well. */
    deletedRepository?: boolean;
}

/**
 * `edit-added-demo` — rename an added demo package's card and change its
 * description. Settings only, so no confirmation: editing again undoes it.
 * The card updates through the settings listener's `addedDemosUpdated` push.
 */
export interface EditAddedDemoRequest {
    source: { owner: string; repo: string };
    name: string;
    /** '' takes the description off the card. */
    description: string;
}

export interface EditAddedDemoResult {
    demo: AddedDemo;
}

/**
 * `change-demo-source` — point the current project at another copy of its
 * demo (the same storefront kind). Rewrites the project's row and the
 * instance metadata the update check reads; the demo package on the Welcome
 * step only when asked. Touches neither the SC's repository nor their site, so pointing
 * back undoes it (decided 2026-09-11).
 */
export interface ChangeDemoSourceRequest {
    demo: AddedDemo;
    updateDemoPackage: boolean;
}

/**
 * "Save as demo package" (step 09). `getDemoPackagePreview` answers what the
 * card would carry and what a project built from it will need; `saveDemoPackage`
 * writes the description file, puts the card on the SC's own Welcome step
 * and answers the link; `removeDemoPackage` undoes exactly what saveDemoPackage
 * did.
 */
export interface DemoPackageCheck {
    id: 'repository' | 'index' | 'datapack' | 'custom-app';
    ok: boolean;
    message: string;
    action?: 'republish';
    repository?: string;
}

export interface DemoPackagePreview {
    /** Prefilled from the brand or demo the project was built on; the SC edits before writing. */
    draft: { name: string; description: string };
    checks: DemoPackageCheck[];
    /** The link a colleague pastes into "Add a demo package". */
    link: string;
    /** Whether the description file in the repository is ours (written by a save). */
    saved: boolean;
    /** Whether the card is on the SC's own Welcome step. */
    onList: boolean;
}

export interface SaveDemoPackageRequest {
    name: string;
    description: string;
}

export interface SaveDemoPackageResult {
    link: string;
    /** What happened to the file: written, unchanged, or skipped because it is not ours. */
    file: 'written' | 'unchanged' | 'skipped';
    /** Why the file was skipped, when it was. */
    fileReason?: string;
    /** The card is on the SC's own Welcome step now (always, after a save). */
    onList: true;
    checks: DemoPackageCheck[];
}

/**
 * Export, "Send a file": one bundle with the ticked parts (owner, 2026-09-13).
 * Saved where the SC says (the host's save dialog), or at `path` inside the
 * project directory when an agent asks. Setup alone is the plain settings file
 * the projects list imports today; anything with the storefront is a bundle.
 */
export interface ExportDemoBundleRequest {
    path?: string;
    /** The setup part (default true). */
    setup?: boolean;
    /** The storefront part (default true; Edge Delivery projects only). */
    storefront?: boolean;
}

export interface ExportDemoBundleResult {
    /** The save dialog was dismissed; nothing was written. */
    cancelled?: boolean;
    path?: string;
    fileCount?: number;
    bytes?: number;
    parts?: Array<'setup' | 'storefront'>;
}

export interface RemoveDemoPackageResult {
    file: 'removed' | 'skipped' | 'absent';
    /** The card was on the SC's list and is now off it. */
    removedFromList: boolean;
}

export interface ChangeDemoSourceResult {
    /** The project's row now. */
    demo: AddedDemo;
    /** Where the project read from before, so the change can be pointed back. */
    previous: { owner: string; repo: string };
}

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
    /** The storefront row when the project is built on an added demo (D2); persisted with the project. */
    demo?: AddedDemo;
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
            indexPath: string;
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
 * `get-components-data` — the wizard's registry read, success shape.
 */
export interface GetComponentsDataResponse {
    success: true;
    type: 'components-data';
    data: ComponentsDataPayload;
}

/**
 * ...and its failure shape, the standard handler envelope.
 *
 * This used to be a COMMENT on the success interface saying failures come back
 * this way, which is exactly as much protection as no type at all: callers read
 * `response.data` and the compiler agreed it was always there. On 2026-09-02 it
 * was not — the handler threw, the envelope arrived, and the Connection view
 * crashed reading `.envVars` off the undefined. Request the union below and the
 * compiler makes you handle both.
 */
export interface GetComponentsDataFailure {
    success: false;
    error?: string;
    code?: string;
    message?: string;
}

export type GetComponentsDataResult = GetComponentsDataResponse | GetComponentsDataFailure;

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
    /** The storefront row when the project is built on an added demo: the phases read it for the repo branch, the pages and the dry check. */
    demo?: AddedDemo;
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
            indexPath: string;
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
        /**
         * The added demo's row, copied here by the handler from the payload so
         * the phases read one config. Absent for a shipped brand.
         */
        demo?: AddedDemo;
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
    /**
     * Headless consent for the toolchain refresh-and-retry: when a build
     * fails with a CLI-staleness signature, the agent surface never prompts —
     * the failure hint tells the agent to confirm with its human and re-call
     * with this flag. Ignored on interactive paths (the notification prompt
     * decides there).
     */
    refreshCli?: boolean;
    /** Display name for a named blank instance (the flow's naming step). */
    name?: string;
    /** Collision-checked instance id for a named blank instance. */
    instanceId?: string;
    /** `'modal'` when the SC started it from the integrations screen (PL-59). */
    progress?: 'modal';
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









