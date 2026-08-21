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
import type { AppBuilderComponentState } from './base';
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
