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
import type { AppBuilderComponentState, Project } from './base';
import type { CommerceStoreStructure } from './commerceStore';
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
