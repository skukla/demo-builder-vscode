/**
 * Settings Serializer Service
 *
 * Handles serialization, parsing, and validation of project settings files.
 * Used for import/export functionality to share settings between projects.
 */

import { SETTINGS_FILE_VERSION, type SettingsFile } from '@/features/projects-dashboard/types/settingsFile';
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
 * Extract settings from an existing project
 *
 * Creates a SettingsFile from a project's current state.
 * Used for "Copy from Existing" functionality.
 *
 * @param project - Source project to extract settings from
 * @param includeSecrets - Whether to include secret values (default: true for local copy)
 * @returns SettingsFile with extracted settings
 */
export function extractSettingsFromProject(
    project: Project,
    includeSecrets = true,
): SettingsFile {
    // Debug: Log what we're extracting
    console.log('[settingsSerializer] Extracting settings from project:', {
        projectName: project.name,
        hasComponentConfigs: !!project.componentConfigs,
        configKeys: project.componentConfigs ? Object.keys(project.componentConfigs) : [],
        sampleConfigs: project.componentConfigs ? JSON.stringify(project.componentConfigs).slice(0, 500) : 'none',
        hasSelections: !!project.componentSelections,
        selections: project.componentSelections,
    });

    return {
        version: SETTINGS_FILE_VERSION,
        exportedAt: new Date().toISOString(),
        source: {
            project: project.name,
        },
        includesSecrets: includeSecrets,
        selections: project.componentSelections || {},
        configs: project.componentConfigs || {},
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
    };
}

/**
 * Create a SettingsFile for export to disk
 *
 * @param project - Source project
 * @param extensionVersion - Current extension version
 * @param includeSecrets - Whether to include secrets
 * @returns SettingsFile ready for JSON serialization
 */
export function createExportSettings(
    project: Project,
    extensionVersion: string,
    includeSecrets = false,
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
