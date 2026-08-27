/**
 * Webview initial-data payloads — the ONE declaration each producer
 * (a command's `getInitialData`) and consumer (the webview entry/screen)
 * check against, so the two sides cannot drift.
 *
 * Fields are required exactly when the producer always sends them; `?` means
 * the producer genuinely omits the value (no project selected, discovery not
 * run yet). Screen prop types derive from these via `Partial<>` where the
 * component is also rendered outside the wire (tests, storybook-style usage).
 *
 * Compiled into the browser bundles: nothing here may import `vscode`.
 *
 * @module types/webviewPayloads
 */

import type { AppBuilderComponentCatalogEntry } from './appBuilderComponents';
import type {
    AppBuilderComponentState,
    AuthoringExperience,
    Project,
    ProjectStatus,
} from './base';
import type { CustomBlockLibrary } from './blockLibraries';
import type { CommerceStoreStructure } from './commerceStore';
import type { EnvVarDefinition, TransformedComponentDefinition } from './components';
import type { SettingsFile } from './settingsFile';
import type { ComponentSelection, CreationProgress, ThemeMode, UnifiedProgress } from './webview';
import type { EditProjectConfig, WizardStepDefinition } from './wizard';
import type { ProjectDisplayName } from '@/core/utils/projectDisplayName';

/**
 * `ShowDataInstallerCommand.getInitialData` → the dataInstaller bundle.
 *
 * Deliberately thin and project-independent: the datapack catalog is global to
 * the service, so the panel opens with no project selected.
 */
export interface DataInstallerInitialData {
    theme: ThemeMode;
    /** Project display name — `''` when no project is selected. */
    projectName: ProjectDisplayName;
}

/**
 * `ProjectDashboardWebviewCommand.getInitialData` → the dashboard bundle.
 */
export interface DashboardInitialData {
    theme: ThemeMode;
    /** Display name + path — `null` when no project is selected. */
    project: { name: ProjectDisplayName; path: string } | null;
    hasMesh: boolean;
    /** Resolved demo-package name (e.g., "CitiSignal") — demo-packages.json `name`. */
    packageName?: string;
    /** Resolved stack/architecture name (e.g., "Headless + PaaS") */
    stackName?: string;
    /** Whether this is an EDS project (always published, no start/stop) */
    isEds: boolean;
    /** Live URL for EDS projects */
    edsLiveUrl?: string;
    /** DA.live authoring URL for EDS projects */
    edsDaLiveUrl?: string;
    /** Initial EDS storefront status (for dynamic status display) */
    initialEdsStorefrontStatus?: Project['edsStorefrontStatusSummary'];
    /** Whether the project has an Adobe org (drives the "Checking organization…" telegraph) */
    hasAdobeContext: boolean;
    /**
     * Whether the Data Installer is switched on AND pointed at an API. Decided
     * host-side (`isDataInstallerConfigured`) because both halves are settings.
     */
    dataInstallerAvailable: boolean;
    /** Keyed appBuilderComponents map (drives the summary tile's count + dot). */
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
}

/**
 * `ShowProjectsListCommand.getInitialData` → the projectsList bundle.
 *
 * The entry fetches everything else itself via `getProjects` (view mode rides
 * that response to avoid racing the init message).
 */
export interface ProjectsListInitialData {
    theme: ThemeMode;
}

/**
 * `CreateProjectWebviewCommand.getInitialData` → the wizard bundle.
 *
 * `null` fields are genuinely null on the wire (postMessage serializes them);
 * the entry converts null → undefined where a container prop wants absence.
 */
export interface WizardInitialData {
    theme: ThemeMode;
    /** First workspace folder path — absent when no folder is open. Currently unread. */
    workspacePath?: string;
    /**
     * defaults.json `componentSelection` — `null` when the file is missing or
     * unparseable. The JSON carries `frontend`/`backend`/`dependencies`/
     * `services`, all fields of {@link ComponentSelection}.
     */
    componentDefaults: ComponentSelection | null;
    /** wizard-steps.json `steps` — `null` when the file is missing or fails validation. */
    wizardSteps: WizardStepDefinition[] | null;
    /** All project names — duplicate-name validation. */
    existingProjectNames: string[];
    /** Full settings file from import/copy — `null` in plain create mode. */
    importedSettings: SettingsFile | null;
    /** Edit-mode configuration — `null` in create mode. */
    editProject: EditProjectConfig | null;
    /** Initial view mode for the template gallery (from settings). */
    projectsViewMode: 'cards' | 'rows';
    /** User's saved block library default preferences (from settings). */
    blockLibraryDefaults: string[];
    /** Custom block libraries from VS Code settings. */
    customBlockLibraryDefaults: CustomBlockLibrary[];
}

/**
 * `ShowAiCommand.getInitialData` → the aiOverview (Prompt Library) bundle.
 */
export interface AiOverviewInitialData {
    theme: ThemeMode;
    project: Project;
}

/**
 * Which half of the workbench a command asked for.
 *
 * `prompt` tries a prompt out; `trace` shows what the agent has already done in
 * this window. Two commands, one panel — so the mode also travels as a push for
 * a workbench that is already open.
 */
/**
 * The Configure screen's registry slice: the categorized component buckets
 * (registry entries pass through untransformed) plus the keyed env-var
 * definitions. No `appBuilder` bucket — that mechanism was removed
 * (`c98e5125`); App Builder fields flow via `appBuilderComponentCatalog`.
 */
export interface ConfigureComponentsData {
    frontends: TransformedComponentDefinition[];
    backends: TransformedComponentDefinition[];
    dependencies: TransformedComponentDefinition[];
    mesh?: TransformedComponentDefinition[];
    integrations?: TransformedComponentDefinition[];
    envVars: Record<string, EnvVarDefinition>;
}

/**
 * `ConfigureProjectWebviewCommand.getInitialData` → the configure bundle.
 */
export interface ConfigureInitialData {
    theme: ThemeMode;
    project: Project;
    componentsData: ConfigureComponentsData;
    /** Existing env values from component .env files. */
    existingEnvValues: Record<string, Record<string, string>>;
    /** All project names — rename validation. */
    existingProjectNames: string[];
    /** Whether this is an EDS project — gates the Authoring Experience radio. */
    isEds: boolean;
    /** Resolved authoring experience seeding the radio (EDS only). */
    authoringExperience: AuthoringExperience;
    /** Catalog entries for the project's selected appBuilderComponents (bucket-3 inputs). */
    appBuilderComponentCatalog: AppBuilderComponentCatalogEntry[];
    /** Resolved provided env values (bucket-2 "connected" sources). */
    providedEnvVars: Record<string, string>;
    /** Per-appBuilderComponent "is set" flags for secret vars (booleans only, no values). */
    appBuilderComponentSecretFlags: Record<string, Record<string, boolean>>;
    /**
     * Component-declared secrets this project holds, booleans only.
     *
     * A migrated credential is in the OS keychain, which the webview cannot
     * read. Without the flag a required password field renders empty and a
     * save writes a blank over a working credential.
     */
    componentSecretFlags: Record<string, Record<string, boolean>>;
}

/**
 * `ShowIntegrationsCommand.getInitialData` → the integrations bundle.
 */
export interface IntegrationsInitialData {
    theme: ThemeMode;
    /** Project display name — `''` when no project is selected. */
    projectName: ProjectDisplayName;
    hasAdobeContext: boolean;
    /** Keyed component map — absent when no project is selected. */
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    /**
     * The discovered Commerce store hierarchy, so the mesh card can NAME the
     * scope codes it was deployed against. Absent until discovery has run once.
     */
    commerceStoreStructure?: CommerceStoreStructure;
    /** Stack-filtered catalog for the add-integration picker. */
    appBuilderComponentCatalog: AppBuilderComponentCatalogEntry[];
    /** Adobe project/workspace TITLES — the shared deploy destination banner. */
    destination: DestinationTitles;
    /** Committed destination ID — the add flow reads presence as a boolean. */
    adobeProjectId?: string;
    /** Committed destination ID — the add flow reads presence as a boolean. */
    adobeWorkspaceId?: string;
    /** The IMS org — the add flow's signed-in test reads this, not the project id. */
    adobeOrgId?: string;
}

// ---------------------------------------------------------------------------
// Push channels — the dashboard status family.
//
// Each payload below is THE declaration for one extension→webview push:
// the sender annotates the object it posts and the receiver casts to the
// same name, so the two sides cannot drift (the same contract the init
// payloads above carry). Consolidated 2026-08-21 from the split
// declarations that had already diverged: the sender's StatusPayload said
// `status: string` and `mesh.status: string` where the receiver's copy
// carried precise unions, and the receiver's copy was missing the
// 'resetting'/'republishing' lifecycle states the sender can post.
// ---------------------------------------------------------------------------

/**
 * The dashboard-family mesh status vocabulary (badge, tile, card). Moved
 * here from dashboardStatusTypes so payloads and webview share ONE union.
 */
export type MeshStatus =
    | 'checking'
    | 'needs-auth'
    | 'not-deployed'
    | 'deploying'
    | 'deployed'
    | 'config-changed'
    | 'config-incomplete'
    | 'update-declined'
    | 'error';

/** Mesh slice of a status update. */
export interface MeshStatusInfo {
    status: MeshStatus;
    endpoint?: string;
    message?: string;
}

/**
 * `statusUpdate` — the dashboard's main status push
 * (`buildStatusPayload` → `useDashboardStatus`). One wire, one name: this
 * WAS `StatusPayload` on the sender and `interface ProjectStatus` on the
 * receiver — the latter also colliding with `@/types/base`'s unrelated
 * ProjectStatus lifecycle union.
 */
export interface DashboardStatusUpdatePayload {
    /**
     * What the dashboard heading shows, and what its inline rename field
     * seeds from. Branded so `name: project.name` — the slug — cannot be
     * assigned here by accident. It was, and shipped.
     */
    name: ProjectDisplayName;
    path: string;
    status: ProjectStatus;
    port?: number;
    adobeOrg?: string;
    adobeProject?: string;
    frontendConfigChanged: boolean;
    mesh?: MeshStatusInfo;
    edsStorefrontStatus?: Project['edsStorefrontStatusSummary'];
}

/** `meshStatusUpdate` — mesh-only status push (deploy flows). */
export interface MeshStatusUpdatePayload {
    status: MeshStatus;
    message?: string;
    endpoint?: string;
}

/**
 * Per-integration row status vocabulary. Moved here from
 * appBuilderComponentHandlers so the push payload and the webview share one
 * declaration.
 */
export type AppBuilderComponentRowStatus =
    | 'deploying'
    | 'deployed'
    | 'stale'
    | 'error'
    | 'not-deployed';

/** `appBuilderComponentStatusUpdate` — flips ONE integration row. */
export interface AppBuilderComponentStatusUpdatePayload {
    id: string;
    status: AppBuilderComponentRowStatus;
    message?: string;
    /** Optional label refresh — the rename handler rides it on this channel. */
    name?: string;
}

/** `appBuilderComponentsSnapshot` — the full fresh persisted map. */
export interface AppBuilderComponentsSnapshotPayload {
    components: Record<string, AppBuilderComponentState>;
}

/** Adobe project/workspace TITLES — the shared deploy destination banner. */
export interface DestinationTitles {
    projectTitle?: string;
    workspaceTitle?: string;
}

/** `projectDestinationUpdate` — destination retarget push. */
export interface ProjectDestinationUpdatePayload {
    destination: DestinationTitles;
}

/** `authoringExperienceUpdate` — live DA URL after an authoring flip. */
export interface AuthoringExperienceUpdatePayload {
    edsDaLiveUrl?: string;
}

/**
 * `creationProgress` — project-creation progress. Also reused verbatim by the
 * AI regenerate flow (aiHandlers) so both surfaces render one payload shape.
 * Completion/cancellation/failure ride THIS channel as sentinel
 * `currentOperation` values ('Project Created' / 'Cancelled' / 'Failed') —
 * the separate creationComplete/creationCancelled pushes were dead sends
 * (no listener) and were deleted 2026-08-21.
 */
export type CreationProgressPayload = CreationProgress;

/** `creationFailed` — terminal failure detail (the progress sentinel's sibling). */
export interface CreationFailedPayload {
    error: string;
    isTimeout?: boolean;
    elapsed?: string;
    /** The one special-cased type; ProjectCreationStep opens the install dialog on it. */
    errorType?: 'GITHUB_APP_NOT_INSTALLED';
    errorDetails?: { owner: string; repo: string; installUrl: string };
}

/**
 * `deployment-status` — Configure screen deploy-in-flight flag. Sent by
 * `withDeploymentStatus` (configure.ts) around mesh/storefront deploys;
 * keeps the Save button disabled while one runs.
 */
export interface DeploymentStatusPayload {
    isDeploying: boolean;
}

/**
 * Plugin row state carried by the prerequisites loaded/status pushes. The
 * loaded push sends config identity only (id/name/description); the status
 * pushes send runtime state (id/name/installed). The UI reads id, name, and
 * installed.
 */
export interface PrerequisitePluginState {
    id: string;
    name: string;
    description?: string;
    /** Absent on the loaded push — install state is only known after a check. */
    installed?: boolean;
}

/**
 * `prerequisites-loaded` — the resolved check list, sent once per check run
 * before the per-row status pushes. `id` is the numeric row index (the sender
 * maps over the list with `id: index`), NOT the prerequisite's string id from
 * prerequisites.json.
 */
export interface PrerequisitesLoadedPayload {
    prerequisites: Array<{
        id: number;
        name: string;
        description: string;
        optional: boolean;
        plugins?: PrerequisitePluginState[];
    }>;
    nodeVersionMapping?: Record<string, string>;
}

/**
 * `prerequisite-status` — one row's live check/install state, keyed by
 * `index`. Sent by the check, continue, install, and shared error paths.
 */
export interface PrerequisiteStatusPayload {
    index: number;
    name: string;
    /** Senders never push 'pending' — a row is born pending, not set to it. */
    status: 'checking' | 'success' | 'error' | 'warning';
    /** Absent on the bare 'checking' pushes; the row keeps its spinner text. */
    message?: string;
    description?: string;
    /** Sent by every push; the webview derives optionality from the loaded list and ignores this. */
    required: boolean;
    /** Sent by result pushes; the webview keys off `status` and ignores this. */
    installed?: boolean;
    version?: string;
    canInstall?: boolean;
    plugins?: PrerequisitePluginState[];
    /** Install-step progress (installHandler only). */
    unifiedProgress?: UnifiedProgress;
    nodeVersionStatus?: Array<{ version: string; component: string; installed: boolean }>;
}

/**
 * `prerequisite-install-complete` — an install finished (or was already
 * satisfied); the webview resumes checking from the next row.
 */
export interface PrerequisiteInstallCompletePayload {
    index: number;
    continueChecking: boolean;
}

/** One prerequisite's outcome in the completion summary. */
export interface PrerequisiteCheckSummary {
    /**
     * Position in the resolved list. The webview's row identity — and NOT a
     * durable name for the prerequisite: the list is rebuilt per check from the
     * stack and the optional dependencies, so index 3 means different things
     * across two calls with different stacks.
     */
    id: number;
    /**
     * The prerequisite's own id from `prerequisites.json` (`node`, `aio-cli`).
     * Stable across checks, which is what makes it the thing an agent can name
     * in a later `install_prerequisite` call. Added for that surface; the
     * webview keys off `id` and ignores this.
     */
    prereqId: string;
    name: string;
    required: boolean;
    installed: boolean;
    version?: string;
    canInstall: boolean;
}

/**
 * `prerequisites-complete` — the check run finished. The webview only uses
 * the event itself (to stop the spinner); the MCP status descriptor captures
 * the payload as the check_prerequisites tool result. Only checkHandler
 * includes the per-prerequisite summary; continueHandler sends the flag alone.
 */
export interface PrerequisitesCompletePayload {
    allInstalled: boolean;
    prerequisites?: PrerequisiteCheckSummary[];
}

/**
 * GitHub user identity, exactly as the GitHub API validation returns it
 * (nullable fields, not optional ones). Moved here from
 * features/eds/services/types so the auth pushes and the services share ONE
 * declaration; the services module re-exports it.
 */
export interface GitHubUser {
    /** GitHub username */
    login: string;
    /** User's email address */
    email: string | null;
    /** User's display name */
    name: string | null;
    /** URL to user's avatar image */
    avatarUrl: string | null;
}

/**
 * `github-auth-status` and `github-auth-complete` — the wizard's GitHub auth
 * state. Both channels carry the same shape; `orgs` feeds the namespace
 * picker (absent on the change-account complete push).
 */
export interface GitHubAuthStatusPayload {
    isAuthenticated: boolean;
    user?: GitHubUser;
    /** GitHub orgs the user is a member of — populates the wizard's namespace picker */
    orgs?: string[];
    error?: string;
}

/** `github-oauth-error` — OAuth flow failure/cancellation. */
export interface GitHubOAuthErrorPayload {
    error: string;
}

/** `dalive-auth-status` — DA.live token state for the wizard. */
export interface DaLiveAuthStatusPayload {
    isAuthenticated: boolean;
    /** From the token's own claims; informational. */
    email?: string;
    /** Whether user has completed bookmarklet setup before */
    setupComplete?: boolean;
    /** Cached org name from previous successful verification */
    orgName?: string;
    /** Bookmarklet URL for token extraction (provided eagerly) */
    bookmarkletUrl?: string;
    error?: string;
}

/** `dalive-login-opened` — browser login launched; the token bookmarklet URL. */
export interface DaLiveLoginOpenedPayload {
    bookmarkletUrl: string;
}

/** `dalive-token-stored` — outcome of validating + storing a pasted token. */
export interface DaLiveTokenStoredPayload {
    success: boolean;
    /** From the token's claims, on success. */
    email?: string;
    error?: string;
}

/** `dalive-token-with-org-result` — combined token store + org verification. */
export interface DaLiveTokenWithOrgResultPayload {
    success: boolean;
    email?: string;
    orgName?: string;
    error?: string;
}

/** `configChanged` — projects-list view-mode setting changed (or re-sent on reveal). */
export interface ConfigChangedPayload {
    projectsViewMode: 'cards' | 'rows';
}

/** `projectsUpdated` — the full refreshed project list for the cards/rows grid. */
export interface ProjectsUpdatedPayload {
    projects: Project[];
}

/**
 * `demoStateChanged` — a demo started or stopped somewhere; the projects list
 * repaints its STARTED badge. `runningProjectPath` is undefined on stop.
 */
export interface DemoStateChangedPayload {
    runningProjectPath?: string;
}

/** `blockLibraryDefaultsUpdated` — the built-in block-library defaults setting changed. */
export interface BlockLibraryDefaultsUpdatedPayload {
    blockLibraryDefaults: string[];
}

/** `customBlockLibraryDefaultsUpdated` — the custom block-library setting changed. */
export interface CustomBlockLibraryDefaultsUpdatedPayload {
    customBlockLibraryDefaults: CustomBlockLibrary[];
}

/**
 * Phase vocabulary the storefront-setup pipeline actually pushes over
 * `storefront-setup-progress`. The webview's own state adds local-only values
 * (idle / github-app / completed / error) on top of these.
 */
export type StorefrontSetupProgressPhase =
    | 'repository'
    | 'storefront-code'
    | 'code-sync'
    | 'site-config'
    | 'content'
    | 'block-library'
    | 'publish'
    | 'cancelling'
    /** Waiting on a DA.live re-auth mid-pipeline (progress: -1). */
    | 'auth-recovery'
    /** The pipeline's own final push; the `storefront-setup-complete` channel follows. */
    | 'complete';

/** `storefront-setup-progress` — pipeline step progress for the wizard. */
export interface StorefrontSetupProgressPayload {
    phase: StorefrontSetupProgressPhase;
    message: string;
    subMessage?: string;
    /** 0-100, or -1 while paused for auth recovery. */
    progress: number;
    /** Repo identity, included once known — drives the webview's cancel-cleanup bookkeeping. */
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
}

/** `storefront-setup-complete` — the pipeline finished. */
export interface StorefrontSetupCompletePayload {
    message: string;
    /** Repo URL; preview/live URLs are derived from it webview-side. */
    githubRepo?: string;
    daLiveSite?: string;
    repoOwner?: string;
    repoName?: string;
    /** Present when setup finished with caveats (e.g. PDP routing degraded). */
    warnings?: string[];
}

/** `storefront-setup-error` — the pipeline failed; the wizard offers Retry. */
export interface StorefrontSetupErrorPayload {
    message: string;
    error: string;
}

/**
 * `storefront-setup-github-app-required` — AEM Code Sync is not installed on
 * the repo; the wizard opens the install dialog.
 */
export interface StorefrontGitHubAppRequiredPayload {
    owner: string;
    repo: string;
    installUrl: string;
    message: string;
    /** Helix has no site for this repo — see GitHubAppInstallDialog. */
    siteUnregistered?: boolean;
}
