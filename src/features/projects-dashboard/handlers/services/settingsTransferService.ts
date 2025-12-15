/**
 * SettingsTransferService
 *
 * Handles settings import, export, and copy operations for projects.
 * Supports importing from files, copying from existing projects, and exporting.
 */

import * as vscode from 'vscode';
import {
    parseSettingsFile,
    isNewerVersion,
    extractSettingsFromProject,
    createExportSettings,
    getSuggestedFilename,
} from '@/features/projects-dashboard/services/settingsSerializer';
import { SETTINGS_FILE_VERSION } from '@/features/projects-dashboard/types/settingsFile';
import { getProjectDescription } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import { showWebviewQuickPick } from '@/core/utils';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Import settings from a JSON file
 *
 * Opens a file picker dialog and parses the selected settings file.
 * Returns the parsed settings to be passed to the wizard.
 */
export async function importSettingsFromFile(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.info('Opening file picker for settings import');

        // Open file picker dialog
        const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Demo Builder Settings': ['json'],
                'All Files': ['*'],
            },
            title: 'Import Settings File',
        });

        if (!fileUris || fileUris.length === 0) {
            // User cancelled
            return {
                success: true,
                data: { success: false, error: 'cancelled' },
            };
        }

        const fileUri = fileUris[0];
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        const jsonString = Buffer.from(fileContent).toString('utf8');

        // Parse and validate using settings serializer
        const parseResult = parseSettingsFile(jsonString);
        if (!parseResult.success) {
            return {
                success: true,
                data: {
                    success: false,
                    error: parseResult.error,
                },
            };
        }

        const settings = parseResult.settings;

        // Version check (allow older versions, just log warning)
        if (isNewerVersion(settings)) {
            context.logger.warn(
                `Settings file version ${settings.version} is newer than supported version ${SETTINGS_FILE_VERSION}`,
            );
        }

        context.logger.info(`Imported settings from file: ${fileUri.fsPath}`);

        // Launch wizard with imported settings
        await vscode.commands.executeCommand('demoBuilder.createProject', {
            importedSettings: settings,
            sourceDescription: `Imported from ${vscode.workspace.asRelativePath(fileUri)}`,
        });

        return {
            success: true,
            data: {
                success: true,
                settings,
                sourceDescription: vscode.workspace.asRelativePath(fileUri),
            },
        };
    } catch (error) {
        context.logger.error('Failed to import settings from file', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to import settings file',
        };
    }
}

/**
 * Copy settings from an existing project
 *
 * Shows a QuickPick of available projects and extracts settings from the selected one.
 */
export async function copySettingsFromProject(
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        context.logger.info('Opening project picker for settings copy');

        // Get all projects
        const projectList = await context.stateManager.getAllProjects();
        const projects: Project[] = [];

        for (const item of projectList) {
            const project = await context.stateManager.loadProjectFromPath(item.path);
            if (project) {
                projects.push(project);
            }
        }

        if (projects.length === 0) {
            return {
                success: true,
                data: {
                    success: false,
                    error: 'No existing projects to copy from.',
                },
            };
        }

        // Build QuickPick items
        const items: vscode.QuickPickItem[] = projects.map((project) => ({
            label: project.name,
            description: getProjectDescription(project),
            detail: project.path,
        }));

        // Show QuickPick (use webview-safe utility for proper keyboard handling)
        const selected = await showWebviewQuickPick(items, {
            title: 'Copy Settings from Project',
            placeholder: 'Select a project to copy settings from',
        });

        if (!selected) {
            // User cancelled
            return {
                success: true,
                data: { success: false, error: 'cancelled' },
            };
        }

        // Find the selected project
        const sourceProject = projects.find((p) => p.path === selected.detail);
        if (!sourceProject) {
            return {
                success: false,
                error: 'Selected project not found',
            };
        }

        // Extract settings from project using serializer
        const settings = extractSettingsFromProject(sourceProject, true);

        context.logger.info(`Copying settings from project: ${sourceProject.name}`);

        // Launch wizard with copied settings
        await vscode.commands.executeCommand('demoBuilder.createProject', {
            importedSettings: settings,
            sourceDescription: `Copied from ${sourceProject.name}`,
        });

        return {
            success: true,
            data: {
                success: true,
                settings,
                sourceDescription: sourceProject.name,
            },
        };
    } catch (error) {
        context.logger.error('Failed to copy settings from project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to copy settings from project',
        };
    }
}

/**
 * Export project settings to a file
 *
 * Shows a save dialog for user to choose location, then writes settings file.
 */
export async function exportProjectSettings(
    context: HandlerContext,
    project: Project,
): Promise<HandlerResponse> {
    try {
        // Get extension version for metadata
        const extension = vscode.extensions.getExtension('AdobeDemoSystem.adobe-demo-builder');
        const extensionVersion = extension?.packageJSON?.version || 'unknown';

        // Create settings using serializer (always include secrets for local export)
        const settings = createExportSettings(project, extensionVersion, true);
        const suggestedFilename = getSuggestedFilename(project.name);

        // Show save dialog
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(suggestedFilename),
            filters: {
                'Demo Builder Settings': ['json'],
                'All Files': ['*'],
            },
            title: 'Export Project Settings',
        });

        if (!saveUri) {
            // User cancelled
            return {
                success: true,
                data: { success: false, error: 'cancelled' },
            };
        }

        // Write the file
        const content = JSON.stringify(settings, null, 2);
        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));

        context.logger.info(`Exported settings to: ${saveUri.fsPath}`);

        // Show success message
        vscode.window.showInformationMessage(`${project.name} exported.`);

        return {
            success: true,
            data: {
                success: true,
                filePath: saveUri.fsPath,
            },
        };
    } catch (error) {
        context.logger.error('Failed to export project settings', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to export project settings',
        };
    }
}
