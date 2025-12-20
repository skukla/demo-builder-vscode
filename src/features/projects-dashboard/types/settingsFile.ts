/**
 * Settings File Types
 *
 * Defines the schema for exported/imported project settings files.
 * These files allow users to share and reuse configuration across projects.
 */

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
 * Complete settings file structure
 */
export interface SettingsFile {
    /** Schema version for future compatibility */
    version: number;
    /** When the settings were exported */
    exportedAt: string;
    /** Source information */
    source: SettingsSource;
    /** Whether secrets are included */
    includesSecrets: boolean;
    /** Component selections */
    selections: SettingsSelections;
    /** Component configuration values */
    configs: SettingsConfigs;
    /** Adobe org/project/workspace context */
    adobe?: SettingsAdobeContext;
    /** Brand ID selected during project creation (e.g., 'citisignal') */
    selectedBrand?: string;
    /** Stack ID selected during project creation (e.g., 'headless-paas') */
    selectedStack?: string;
}

/** Current schema version */
export const SETTINGS_FILE_VERSION = 1;

/**
 * Result of importing settings
 */
export interface ImportResult {
    success: boolean;
    settings?: SettingsFile;
    error?: string;
    /** Source description for UI feedback */
    sourceDescription?: string;
}
