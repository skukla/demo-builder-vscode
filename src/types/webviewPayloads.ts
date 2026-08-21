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
import type { AppBuilderComponentState, AuthoringExperience, Project } from './base';
import type { CommerceStoreStructure } from './commerceStore';
import type { EnvVarDefinition, TransformedComponentDefinition } from './components';
import type { ThemeMode } from './webview';

/**
 * `ShowDataInstallerCommand.getInitialData` → the dataInstaller bundle.
 *
 * Deliberately thin and project-independent: the datapack catalog is global to
 * the service, so the panel opens with no project selected.
 */
export interface DataInstallerInitialData {
    theme: ThemeMode;
    /** Project display name — `''` when no project is selected. */
    projectName: string;
}

/**
 * `ProjectDashboardWebviewCommand.getInitialData` → the dashboard bundle.
 */
export interface DashboardInitialData {
    theme: ThemeMode;
    /** Display name + path — `null` when no project is selected. */
    project: { name: string; path: string } | null;
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
    /** Stack-filtered catalog — currently unread by the dashboard screen. */
    appBuilderComponentCatalog: AppBuilderComponentCatalogEntry[];
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
    projectName: string;
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
    destination: { projectTitle?: string; workspaceTitle?: string };
    /** Committed destination ID — the add flow reads presence as a boolean. */
    adobeProjectId?: string;
    /** Committed destination ID — the add flow reads presence as a boolean. */
    adobeWorkspaceId?: string;
    /** The IMS org — the add flow's signed-in test reads this, not the project id. */
    adobeOrgId?: string;
}
