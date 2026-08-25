/**
 * Base Type Definitions
 *
 * Core types used across the extension. This file contains primitive types
 * that don't depend on other type files, breaking circular dependencies.
 */

import type { CustomBlockLibrary, InstalledBlockLibrary } from './blockLibraries';
import type { CommerceStoreStructure } from './commerceStore';
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
/**
 * One completed evaluation, as it is remembered.
 *
 * Runs are grouped by {@link EvaluationRun.threadId} — the piece of work — and
 * each run stores the prompt text VERBATIM as it was run. Verbatim matters twice
 * over: it is what makes "go back to the cheapest version" possible, and it is
 * the failure `.rptc/plans/evaluation-mode/battery/` exists to prevent, where
 * six prompts were lost and every result measured against them became
 * uncomparable.
 */
export interface EvaluationRun {
    /**
     * The piece of WORK this run belongs to — "getting this prompt right".
     *
     * The unit that matters, and the reason this field exists. History used to
     * key on the prompt TEXT, so improving a prompt made it a different prompt
     * with no past: "down from $0.24" appeared only when re-running something
     * unchanged, the one case where nothing improved. The headline feature did
     * not fire during the loop it was built for.
     *
     * A thread is DECLARED, never inferred. No fuzzy matching — a producer must
     * be able to say why two runs are in the same thread, and "the model thought
     * they were alike" fails that.
     */
    threadId: string;
    /**
     * The saved prompt this thread belongs to, when there is one.
     *
     * Set when a thread is started from the library, and it does two jobs:
     * coming back to a saved prompt resumes its history, and an anchored thread
     * survives eviction longer than an abandoned experiment.
     *
     * A pinned prompt appears in every project while history is per project, so
     * one saved prompt can anchor several threads — one per project. That is
     * correct: the same prompt costs different amounts against different
     * projects.
     */
    promptId?: string;
    /** The prompt as it was run — this version, not the thread's latest. */
    prompt: string;
    /** Real dollars, from the run's own output. */
    costUSD: number;
    /** Demo Builder tool calls the run made. */
    steps: number;
    /** How many of those asked something already asked. */
    wastedSteps: number;
    /** Wall clock, milliseconds. */
    durationMs: number;
    /** When it ran (ISO 8601), so a trend reads in order. */
    at: string;
}

export interface Project {
    /**
     * The SLUG. Folder name under `~/.demo-builder/projects/`, the key
     * `createHandler` dedupes on, and the path `renameProjectCore` moves.
     * Constrained to `[a-z][a-z0-9-]*` because a filesystem and a shell have
     * opinions. Never rendered directly — see {@link title}.
     */
    name: string;
    /**
     * What the user typed, shown wherever a human reads the project's name.
     *
     * Optional forever: projects created before this existed have only a slug
     * and must render exactly as they always have, so there is no migration.
     * Read it through `getProjectDisplayName`, never directly — that helper is
     * what makes a missed display site greppable.
     */
    title?: string;
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
        frontend?: string; // Component ID
        backend?: string; // Component ID
        dependencies?: string[]; // Component IDs
        integrations?: string[]; // Component IDs
        appBuilder?: string[]; // Component IDs
    };
    // Component configurations (environment variables and settings)
    componentConfigs?: Record<string, Record<string, string | boolean | number | undefined>>;
    /**
     * The discovered Commerce store hierarchy — websites, store groups and store
     * views, each with its `code` AND its human `name`.
     *
     * The pickers show the user "CitiSignal Store"; only `citisignal_store` was
     * ever kept, so every later surface made them translate. The structure is
     * the one thing that holds both, and it was fetched and thrown away on every
     * discovery. Persisting it turns a name into an offline lookup BY CODE on any
     * surface — which is also why nothing has to pair a name with a code
     * defensively: the code IS the lookup key, so a name can never land on the
     * wrong one.
     *
     * A CATALOG, not a selection: refreshed wholesale whenever discovery runs.
     * Absent until it has run once (every project predating this) — consumers
     * then show the bare code, which is a correct rendering, not a degraded one.
     */
    commerceStoreStructure?: CommerceStoreStructure;
    // Package/Stack/Addons selections (vertical + architecture)
    /** Package ID selected during project creation (e.g., 'citisignal', 'buildright') */
    selectedPackage?: string;
    /**
     * Sample data chosen during creation, installed later from the dashboard.
     *
     * Recorded, not applied: an import needs a reachable instance with working
     * credentials and runs for minutes, so it never happens inside the wizard.
     */
    datapack?: { name: string; version: string };
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
    meshStatusSummary?:
        | 'deployed'
        | 'stale'
        | 'config-incomplete'
        | 'update-declined'
        | 'not-deployed'
        | 'error'
        | 'unknown';
    // LEGACY-READ-ONLY mesh deployment state (ADR-011 D3 Step 07). The
    // authoritative home for the mesh endpoint + staleness baseline is the
    // keyed mesh `appBuilderComponents` entry; this singleton is never written
    // or persisted anymore. It exists so legacy manifests (of arbitrary age)
    // keep loading: the loader reads it and the read-migration folds it into
    // the keyed map. See docs/architecture/state-ownership.md.
    meshState?: {
        envVars: Record<string, string>;
        sourceHash: string | null;
        lastDeployed: string; // ISO date string
        endpoint?: string; // mesh GraphQL endpoint URL (legacy manifests only)
        userDeclinedUpdate?: boolean; // User clicked "Later" on redeploy prompt
        declinedAt?: string; // ISO date string when user declined
    };
    // App Builder app status summary for card grid display
    appStatusSummary?: 'deployed' | 'stale' | 'not-deployed' | 'error' | 'unknown';
    // LEGACY-READ-ONLY App Builder app deployment state (ADR-011 D3 Step 07).
    // The authoritative home for integration deploy state is the keyed
    // `appBuilderComponents` entry per integration; this singleton is never
    // written or persisted anymore — kept only so legacy manifests load and
    // migrate. See docs/architecture/state-ownership.md.
    appState?: {
        appId?: string;
        url?: string; // Primary deployed app URL
        status: 'deployed' | 'error' | 'not-deployed';
        deployedUrls?: Record<string, string>; // Per-action/runtime URLs
        lastDeployed?: string; // ISO date string
        sourceHash?: string | null;
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
    // Frontend config state (tracks changes since demo started)
    frontendEnvState?: {
        envVars: Record<string, string>;
        capturedAt: string; // ISO date string
    };
    // Component version tracking (for updates)
    componentVersions?: Record<
        string,
        {
            version: string;
            lastUpdated: string; // ISO date string
        }
    >;
    /**
     * Keyed appBuilderComponent state — THE single source of truth for mesh +
     * integration deploy state (Model B; the plan/ADR call this concept a
     * "deployable" — `appBuilderComponent` is the shipped name). Persisted in
     * the manifest (D3 Step 01) and, since D3 Step 07 retired the singular
     * write-side, the only written model; the legacy singletons above are
     * read-only migration inputs. See
     * docs/architecture/adr/011-app-builder-deployables.md.
     */
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    /**
     * Adobe API sdk codes added at runtime (the `add_console_apis` MCP tool),
     * beyond any catalog entry's `requiredApis`. Persisted so every subsequent
     * subscription reconcile includes them in the union — the Console
     * subscribe PUTs the full list, so an unpersisted ad-hoc API would be
     * silently dropped on the next component add/remove.
     */
    additionalConsoleApis?: string[];
    /**
     * Ad-hoc Console API picks, ATTRIBUTED to the integration that wanted them.
     * Supersedes the flat `additionalConsoleApis` above, which lost attribution
     * at the persist boundary. The subscribe union is derived at read time via
     * `resolveDesiredApis`; `__existing__` carries pre-attribution picks whose
     * owner is unrecoverable. See `app-builder/services/componentApiPicks.ts`.
     */
    componentApiPicks?: Record<string, string[]>;
    /** User-saved AI prompts */
    aiPrompts?: AiPrompt[];
    /**
     * Past evaluations, so "is this prompt getting better" survives a reload.
     *
     * Project-scoped and stored here rather than in `globalState`, matching the
     * rule `aiPrompts` already set: project-specific in the manifest, global in
     * extension state. An evaluation is always against one project.
     *
     * Deliberately NOT the trace — that is the diagnostic you read once, and
     * keeping it would recreate the unbounded-log concern the in-memory recorder
     * was capped to avoid. Five numbers per run and nothing else.
     *
     * Capped and rotated; see `evaluationHistory.ts`.
     */
    evaluationHistory?: EvaluationRun[];
    /**
     * Version of the AI context bundle last generated into this project (stamped
     * from the `AI_CONTEXT_VERSION` constant on generate). Since v8 a stale (or
     * absent) stamp no longer flags the project in the UI — the activation sweep
     * (`aiBundleActivationRefresh`) silently refreshes tiers 1+2 on the next
     * extension start; the freshness check only logs it as a support trail.
     */
    aiContextVersion?: number;
    /**
     * Per-file sha-256 hashes of the AI-bundle files last generated into this
     * project, keyed by posix project-relative path (`AGENTS.md`,
     * `.claude/skills/add-component.md`). The GeneratedFileWriter compares the
     * recorded hash against disk to tell "ours" (safe to overwrite/remove)
     * from "user-edited" (skip and report) — ADR-013 hash-and-skip
     * (docs/architecture/adr/013-generated-file-edit-survival.md). Absent on
     * pre-ADR projects: their bundle files are treated as unmodified once,
     * overwritten, and recorded.
     */
    aiFileHashes?: Record<string, string>;
    /**
     * When this storefront's runtime publish key was last registered with the
     * shared PDP action (ISO 8601).
     *
     * Written ONLY by the activation renewal sweep, which uses it to decide
     * whether a key is old enough to refresh. Helix keys expire in about a year;
     * absent here means "never stamped", which the sweep treats as due — so every
     * storefront created before the sweep existed renews on first activation.
     */
    publishKeyRegisteredAt?: string;
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

/** An App Builder component's kind: a mesh artifact or a custom App Builder integration. */
export type AppBuilderComponentKind = 'mesh' | 'integration';

/**
 * Keyed appBuilderComponent state (Model B). One concept replaces the singular
 * `meshState` + `appState`. The mesh's endpoint + staleness fields and an
 * integration's URL(s) live here.
 */
export interface AppBuilderComponentState {
    kind: AppBuilderComponentKind;
    status: 'deployed' | 'stale' | 'error' | 'not-deployed';
    /** Display name for the integration (durable home for the user-facing name). */
    name?: string;
    source: { owner: string; repo: string; branch?: string };
    endpoint?: string; // mesh GraphQL endpoint
    url?: string; // integration primary URL
    deployedUrls?: Record<string, string>;
    sourceHash?: string | null;
    lastDeployed?: string; // ISO date string
    /**
     * Why the last deploy failed — set with `status: 'error'`, cleared by the next
     * non-error outcome (see `recordDeployOutcome`).
     *
     * Without it a failed component persisted the fact of failure and none of the
     * reason, so the card read "Deploy failed" / MESH ERROR and the only way to
     * learn more was to run the deploy again and watch the logs. Redacted and
     * first-line-only via `sanitizeErrorForLogging` before it lands here: this is
     * persisted to the project manifest on disk, so raw CLI output must not be.
     */
    error?: string;
    /** Resolved provided values another appBuilderComponent consumes (e.g. { MESH_ENDPOINT }). */
    providesEnvVars?: Record<string, string>;
    // Mesh-kind runtime fields (ADR-011 D3 Step 06). These previously lived
    // only on the singular `meshState` (same values, so no new data exposure);
    // the keyed entry is their durable home so Step 07 can retire `meshState`.
    /** Env vars at last deploy — the staleness baseline (mesh kind). */
    envVars?: Record<string, string>;
    /** User clicked "Later" on the redeploy prompt (mesh kind). */
    userDeclinedUpdate?: boolean;
    /** ISO date string when the user declined (mesh kind). */
    declinedAt?: string;
}

export interface CustomIconPaths {
    light: string; // Path to icon for light theme
    dark: string; // Path to icon for dark theme
}

/**
 * AEM authoring experience for an EDS project.
 *
 * Stored per-project on the EDS component-instance metadata as
 * `authoringExperience` (beside `daLiveOrg`/`daLiveSite`). Absence falls back
 * to the global `demoBuilder.daLive.authoringExperience` setting (default
 * 'da-live-classic'). Resolved via resolveAuthoringExperience in authoringExperience.ts.
 */
export type AuthoringExperience = 'da-live-classic' | 'experience-workspace';

export interface ComponentInstance {
    id: string; // Component ID (e.g., "headless")
    name: string; // Human-readable name
    type?: 'frontend' | 'backend' | 'dependency' | 'external-system' | 'app-builder'; // Load-bearing: getComponentInstancesByType filters on it (frontend port, mesh lookup)
    subType?: 'mesh' | 'app' | 'utility' | 'service';
    icon?: string | CustomIconPaths; // VSCode ThemeIcon name OR custom icon paths
    path?: string; // Full path to cloned repo (if applicable)
    repoUrl?: string; // Git repository URL
    branch?: string; // Current branch
    version?: string; // Version/commit hash
    status: ComponentStatus;
    port?: number; // For components that run locally
    pid?: number; // Process ID if running
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

export type ProjectTemplate = 'commerce-paas' | 'commerce-saas' | 'aem-commerce' | 'custom';

export type ProjectStatus =
    | 'created'
    | 'configuring'
    | 'ready'
    | 'starting' // Transitional: demo is starting up
    | 'running'
    | 'stopping' // Transitional: demo is shutting down
    | 'stopped'
    | 'resetting' // Transitional: EDS project is being reset
    | 'republishing' // Transitional: EDS project content is being republished
    | 'error';

export interface AdobeConfig {
    // Every field here is optional because that is the DATA's truth: real
    // manifests hold as little as {organization, organizationName}, and the
    // wizard's create-project payload sends whatever subset the user reached.
    // The old required fields were fiction — every live consumer already
    // optional-chains (verified 2026-08-22: making them honest surfaced zero
    // compile errors).
    projectId?: string;
    projectName?: string;
    /** Human-readable project title (preferred for display) */
    projectTitle?: string;
    organization?: string;
    /** Human-readable org name (for display; the token can't resolve it when wrong) */
    organizationName?: string;
    workspace?: string;
    /** Human-readable workspace name — written by the wizard and read back by
     *  `useWizardState`; the type simply never declared it. */
    workspaceName?: string;
    /** Human-readable workspace title (preferred for display) */
    workspaceTitle?: string;
    authenticated?: boolean;
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
    type?: 'frontend' | 'backend' | 'dependency' | 'external-system' | 'app-builder'; // Load-bearing: getComponentInstancesByType filters on it (frontend port, mesh lookup)
    subType?: 'mesh' | 'app' | 'utility' | 'service';
    icon?: string | CustomIconPaths; // VSCode ThemeIcon name OR custom icon paths
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
        shallow?: boolean; // Use --depth=1 for faster clones
        tag?: string; // Clone specific tag
        commit?: string; // Clone specific commit hash
    };

    // Timeout configuration (milliseconds)
    timeouts?: {
        clone?: number; // Override default clone timeout
        install?: number; // Override default install timeout
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
    buildScript?: string; // npm script to run after install (e.g., "build")
    skipNpmInstall?: boolean; // Skip npm install after update (e.g., EDS storefronts)
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
