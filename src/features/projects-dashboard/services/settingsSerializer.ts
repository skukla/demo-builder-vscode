/**
 * Settings Serializer Service
 *
 * Handles serialization, parsing, and validation of project settings files.
 * Used for import/export functionality to share settings between projects.
 */

import { stripSecretValues } from '@/features/components/config/envVarKeys';
import { getAppBuilderComponentEntry } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import {
    SETTINGS_FILE_VERSION,
    type SettingsFile,
    type SettingsEdsConfig,
} from '@/features/projects-dashboard/types/settingsFile';
import type { Project } from '@/types/base';

/**
 * Result of parsing a settings file
 */
export interface ParseResult {
    success: true;
    settings: SettingsFile;
}

/**
 * Error result from parsing a settings file
 */
export interface ParseError {
    success: false;
    error: string;
}

/**
 * Parse and validate a JSON string as a settings file
 *
 * @param jsonString - Raw JSON string to parse
 * @returns ParseResult on success, ParseError on failure
 */
export function parseSettingsFile(jsonString: string): ParseResult | ParseError {
    // Parse JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch {
        return {
            success: false,
            error: "This file couldn't be read. It may have been corrupted.",
        };
    }

    // Validate structure
    if (!isValidSettingsFile(parsed)) {
        return {
            success: false,
            error: "This doesn't appear to be a Demo Builder settings file.",
        };
    }

    return {
        success: true,
        settings: parsed as SettingsFile,
    };
}

/**
 * Validate that an object has the required settings file structure
 *
 * @param obj - Object to validate
 * @returns True if valid settings file structure
 */
export function isValidSettingsFile(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    // Must have version field
    if (!('version' in obj) || typeof obj.version !== 'number') {
        return false;
    }

    return true;
}

/**
 * Check if settings file version is newer than supported
 *
 * @param settings - Settings file to check
 * @returns True if version is newer than supported
 */
export function isNewerVersion(settings: SettingsFile): boolean {
    return settings.version > SETTINGS_FILE_VERSION;
}

/**
 * Derive the wizard's custom-source map from the keyed `appBuilderComponents`
 * map (§E, shell instancing Step 8). The keyed map is the durable model —
 * deriving (instead of persisting a parallel copy) means removed integrations
 * can never resurrect in edit mode. Qualifying entries are custom-URL imports
 * and AI-built instances: `kind === 'integration'` AND not a catalog id
 * (catalog + mesh entries round-trip via their selection ids, keeping their
 * edit-mode row kinds stable). The persisted display `name` rides along.
 *
 * @param project - Source project (keyed map may be absent on legacy projects)
 * @returns The derived source map, or undefined when nothing qualifies
 */
function deriveAppBuilderComponentSources(
    project: Project,
): SettingsFile['appBuilderComponentSources'] {
    const derived: NonNullable<SettingsFile['appBuilderComponentSources']> = {};
    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        if (state.kind !== 'integration') continue;
        if (getAppBuilderComponentEntry(id) !== undefined) continue;
        if (!state.source) continue; // defensive: malformed persisted entry
        derived[id] = state.name ? { ...state.source, name: state.name } : { ...state.source };
    }
    return Object.keys(derived).length ? derived : undefined;
}

/**
 * Extract settings from an existing project
 *
 * Creates a SettingsFile from a project's current state.
 * Used for "Copy from Existing" functionality.
 *
 * @param project - Source project to extract settings from
 * @param includeSecrets - Whether to write credential VALUES into the file.
 *   REQUIRED, no default: this used to default `true` here and `false` in
 *   `createExportSettings`, so the same operation carried secrets or not
 *   depending on which door the caller came through. Every caller states intent.
 * @returns SettingsFile with extracted settings
 */
export function extractSettingsFromProject(
    project: Project,
    includeSecrets: boolean,
): SettingsFile {
    // Extract EDS config from eds-storefront component metadata (if present)
    let edsConfig: SettingsEdsConfig | undefined;
    const edsStorefront = project.componentInstances?.['eds-storefront'];
    if (edsStorefront?.metadata) {
        const metadata = edsStorefront.metadata as Record<string, unknown>;
        // Parse "owner/repo" format from githubRepo metadata
        const githubRepoParts = metadata.githubRepo?.toString().split('/');

        // Only include project-specific EDS fields
        // templateOwner, templateRepo, contentSource, patches are derived from brand+stack
        edsConfig = {
            daLiveOrg: metadata.daLiveOrg as string | undefined,
            daLiveSite: metadata.daLiveSite as string | undefined,
            githubOwner: githubRepoParts?.[0], // Extract owner from "owner/repo"
            repoName: githubRepoParts?.[1], // Extract repo name from "owner/repo"
            repoUrl: metadata.repoUrl as string | undefined,
        };
    }

    return {
        version: SETTINGS_FILE_VERSION,
        exportedAt: new Date().toISOString(),
        source: {
            project: project.name,
        },
        includesSecrets: includeSecrets,
        selections: project.componentSelections || {},
        // `includeSecrets` used to be consumed ONLY by the line above — the label —
        // while configs went out whole. So `includeSecrets: false` produced a file
        // containing ADOBE_COMMERCE_ADMIN_PASSWORD and stamped it
        // `includesSecrets: false`: not a leak so much as a file that asserts it is
        // safe to share when it is not, against an MCP description promising "a
        // secret-free copy". The flag now actually removes them.
        configs: includeSecrets
            ? project.componentConfigs || {}
            : stripSecretValues(project.componentConfigs),
        adobe: project.adobe
            ? {
                  // Include IDs for pre-selection in wizard
                  // Note: project.adobe stores IDs in organization/workspace fields
                  orgId: project.adobe.organization,
                  projectId: project.adobe.projectId,
                  workspaceId: project.adobe.workspace,
                  // Include names for display and fallback matching
                  projectName: project.adobe.projectName,
                  projectTitle: project.adobe.projectTitle,
                  workspaceTitle: project.adobe.workspaceTitle,
              }
            : undefined,
        // Package/Stack/Addons selections for import/copy retention
        selectedPackage: project.selectedPackage,
        selectedStack: project.selectedStack,
        selectedAddons: project.selectedAddons,
        selectedBlockLibraries: project.selectedBlockLibraries,
        customBlockLibraries: project.customBlockLibraries,
        installedBlockLibraries: project.installedBlockLibraries,
        // EDS configuration (for Edge Delivery Services stacks)
        edsConfig,
        // App Builder integration round-trip: custom/instance sources are
        // DERIVED from the keyed appBuilderComponents map (§E); the Console API
        // picks beyond requiredApis persist on the project (manifest field)
        appBuilderComponentSources: deriveAppBuilderComponentSources(project),
        // BOTH forms. The keyed map is the one that survives step 07 — exporting the
        // flat field alone meant a settings file would carry nothing once the flat
        // write is retired, and an edit round-trip collapsed every pick into the
        // unattributed bucket even before then.
        additionalConsoleApis: project.additionalConsoleApis,
        componentApiPicks: project.componentApiPicks,
    };
}

/**
 * Create a SettingsFile for export to disk
 *
 * @param project - Source project
 * @param extensionVersion - Current extension version
 * @param includeSecrets - Whether to write credential VALUES into the file.
 *   REQUIRED, no default — see {@link extractSettingsFromProject}.
 * @returns SettingsFile ready for JSON serialization
 */
export function createExportSettings(
    project: Project,
    extensionVersion: string,
    includeSecrets: boolean,
): SettingsFile {
    const settings = extractSettingsFromProject(project, includeSecrets);
    settings.source.extension = extensionVersion;
    return settings;
}

/**
 * Generate a suggested filename for exported settings
 *
 * @param projectName - Name of the project
 * @returns Suggested filename (e.g., "my-project.demo-builder.json")
 */
export function getSuggestedFilename(projectName: string): string {
    // Sanitize project name for filename
    const sanitized = projectName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return `${sanitized || 'project'}.demo-builder.json`;
}
