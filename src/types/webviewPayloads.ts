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
import type { AppBuilderComponentState, AuthoringExperience, Project, ProjectStatus } from './base';
import type { CustomBlockLibrary } from './blockLibraries';
import type { CommerceStoreStructure } from './commerceStore';
import type { EnvVarDefinition, TransformedComponentDefinition } from './components';
import type { SettingsFile } from './settingsFile';
import type { ComponentSelection, CreationProgress, ThemeMode } from './webview';
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
