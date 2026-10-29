/**
 * Settings File Types: the version-1 project file, READ-ONLY.
 *
 * Nothing writes this shape any more: export writes the version-2 `ProjectFile`
 * (`types/projectFile.ts`). It stays because version-1 files written before
 * 2026-10 are still on disk, and `readProjectFile` migrates them; `SettingsFile`
 * is the shape that migration reads. The pieces both versions share
 * (selections, Adobe context, configs, the storefront fields Edit reopens) are
 * declared here and reused by the version-2 types.
 */

import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { AddedDemo } from '@/types/projectFile';

/**
 * Component selections - which components are chosen
 */
export interface SettingsSelections {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    integrations?: string[];
    appBuilder?: string[];
}

/**
 * Adobe context - org/project/workspace binding
 *
 * Note: Both `name` and `title` fields exist because:
 * - `name` is often an auto-generated ID (e.g., "833BronzeShark")
 * - `title` is the human-readable display name (e.g., "Citisignal Headless")
 */
export interface SettingsAdobeContext {
    orgId?: string;
    orgName?: string;
    projectId?: string;
    projectName?: string;
    /** Human-readable project title (preferred for display) */
    projectTitle?: string;
    workspaceId?: string;
    workspaceName?: string;
    /** Human-readable workspace title (preferred for display) */
    workspaceTitle?: string;
}

/**
 * Component configs - environment variable values
 * Maps componentId -> { VAR_NAME: value }
 */
export type SettingsConfigs = Record<string, Record<string, string | boolean | number | undefined>>;

/**
 * Source information about where settings were exported from
 */
export interface SettingsSource {
    project?: string;
    extension?: string;
}

/**
 * EDS (Edge Delivery Services) configuration
 * Contains project-specific EDS settings (user's repos/sites).
 * Note: templateOwner, templateRepo, contentSource, patches are derived from
 * selectedPackage + selectedStack via demo-packages.json, not stored per-project.
 */
export interface SettingsEdsConfig {
    /** DA.live organization name (user's org) */
    daLiveOrg?: string;
    /** DA.live site name (user's site) */
    daLiveSite?: string;
    /** GitHub owner/username (user's GitHub account) */
    githubOwner?: string;
    /** GitHub repository name (user's repo) */
    repoName?: string;
    /** Full GitHub repository URL (e.g., https://github.com/owner/repo) */
    repoUrl?: string;
}

/**
 * The version-1 file as it sits on disk. Read by the migration, never written.
 */
export interface SettingsFile {
    /** Schema version for future compatibility */
    version: number;
    /** When the settings were exported */
    exportedAt: string;
    /** Source information */
    source: SettingsSource;
    /** Component selections */
    selections: SettingsSelections;
    /** Component configuration values */
    configs: SettingsConfigs;
    /** Adobe org/project/workspace context */
    adobe?: SettingsAdobeContext;
    /** Package ID selected during project creation (e.g., 'citisignal', 'buildright') */
    selectedPackage?: string;
    /** The storefront row when the project was built on an added demo (D2). */
    demo?: AddedDemo;
    /** Stack ID selected during project creation (e.g., 'headless-paas') */
    selectedStack?: string;
    /** Optional addons selected during project creation (e.g., ['adobe-commerce-aco']) */
    selectedAddons?: string[];
    /** Selected block library IDs (e.g., ['isle5', 'demo-team-blocks']) */
    selectedBlockLibraries?: string[];
    /** Custom block libraries added by URL */
    customBlockLibraries?: CustomBlockLibrary[];
    /** EDS configuration (for Edge Delivery Services stacks) */
    edsConfig?: SettingsEdsConfig;
    /**
     * Custom GitHub sources for selected App Builder integrations, keyed by
     * integration id (custom-URL entries only). Carried so edit mode can
     * round-trip custom integrations. `name` carries the user-facing display
     * name for shell instances.
     */
    appBuilderComponentSources?: Record<
        string,
        { owner: string; repo: string; branch?: string; name?: string }
    >;
    /**
     * Adobe Console API sdk codes subscribed beyond catalog `requiredApis`, with no
     * record of which integration wanted each. Old files carry it; the migration
     * folds it under the unattributed key of `componentApiPicks`.
     */
    additionalConsoleApis?: string[];
    /** The ATTRIBUTED form of the same picks: which integration wanted each code. */
    componentApiPicks?: Record<string, string[]>;
}

