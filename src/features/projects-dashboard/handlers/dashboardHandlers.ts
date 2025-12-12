/**
 * Projects Dashboard Message Handlers
 *
 * Handles messages from the Projects Dashboard webview.
 * Follows Pattern B: Returns response data (doesn't use sendMessage).
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import { sessionUIState } from '@/core/state/sessionUIState';
import { validateProjectPath } from '@/core/validation/securityValidation';
import type { Project } from '@/types/base';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import {
    parseSettingsFile,
    isNewerVersion,
    extractSettingsFromProject,
} from '../services/settingsSerializer';
import { SETTINGS_FILE_VERSION } from '../types/settingsFile';
import { getProjectDescription } from '../utils/componentSummaryUtils';

/**
 * Get all projects from StateManager
 *
 * Loads the list of projects and enriches with full project data.
 * Also includes current config for initial render.
 */
export const handleGetProjects: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        // Get list of project paths
        const projectList = await context.stateManager.getAllProjects();

        // Load full project data for each
        const projects: Project[] = [];
        for (const item of projectList) {
            const project = await context.stateManager.loadProjectFromPath(item.path);
            if (project) {
                projects.push(project);
            }
        }

        // Include config in response (avoids race condition with init message)
        // Session override takes precedence over VS Code setting
        const config = vscode.workspace.getConfiguration('demoBuilder');
        const configViewMode = config.get<'cards' | 'rows'>('projectsViewMode', 'cards');
        const projectsViewMode = sessionUIState.viewModeOverride ?? configViewMode;

        return {
            success: true,
            data: { projects, projectsViewMode },
        };
    } catch (error) {
        context.logger.error('Failed to load projects', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to load projects',
        };
    }
};

/**
 * Select a project by path
 *
 * Loads the project and sets it as the current project.
 */
export const handleSelectProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    try {
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
            };
        }

        // SECURITY: Validate path is within demo-builder projects directory
        // Prevents path traversal attacks (CWE-22)
        try {
            validateProjectPath(payload.projectPath);
        } catch (validationError) {
            context.logger.error(
                'Path validation failed',
                validationError instanceof Error ? validationError : undefined,
            );
            return {
                success: false,
                error: 'Invalid project path',
            };
        }

        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);

        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        // Set as current project in state
        await context.stateManager.saveProject(project);
        context.logger.info(`Selected project: ${project.name}`);

        // Navigate to project dashboard
        // Note: The dashboard command handles disposing the Projects List panel
        // Start transition to prevent auto-open handler from firing during panel disposal
        await BaseWebviewCommand.startWebviewTransition();
        try {
            await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
        } catch (navError) {
            // Log navigation failure but don't fail the selection
            // Project was successfully selected, navigation is non-critical
            context.logger.error(
                'Failed to navigate to dashboard',
                navError instanceof Error ? navError : undefined,
            );
        } finally {
            BaseWebviewCommand.endWebviewTransition();
        }

        return {
            success: true,
            data: { project },
        };
    } catch (error) {
        context.logger.error('Failed to select project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to select project',
        };
    }
};

/**
 * Trigger project creation wizard
 */
export const handleCreateProject: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        context.logger.info('Creating new project from dashboard');
        // Note: The wizard command handles disposing the Projects List panel
        await vscode.commands.executeCommand('demoBuilder.createProject');
        return {
            success: true,
        };
    } catch (error) {
        context.logger.error('Failed to start project creation', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to start project creation',
        };
    }
};

/**
 * Open documentation URL
 */
export const handleOpenDocs: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        // TODO: Replace with actual documentation URL when available
        const docsUrl = 'https://github.com/anthropics/demo-builder-vscode#readme';
        await vscode.env.openExternal(vscode.Uri.parse(docsUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open documentation', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open documentation',
        };
    }
};

/**
 * Open help/support URL
 */
export const handleOpenHelp: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        // TODO: Replace with actual help URL when available
        const helpUrl = 'https://github.com/anthropics/demo-builder-vscode/issues';
        await vscode.env.openExternal(vscode.Uri.parse(helpUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open help', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open help',
        };
    }
};

/**
 * Open VS Code settings for this extension
 */
export const handleOpenSettings: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        // Open VS Code settings filtered to this extension
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:adobe.demo-builder');
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open settings', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open settings',
        };
    }
};

/**
 * Set view mode override for the session
 *
 * Persists the user's view mode preference for this session,
 * overriding the VS Code setting until extension is reloaded.
 */
export const handleSetViewModeOverride: MessageHandler<{ viewMode: 'cards' | 'rows' }> = async (
    _context: HandlerContext,
    payload?: { viewMode: 'cards' | 'rows' },
): Promise<HandlerResponse> => {
    if (payload?.viewMode) {
        sessionUIState.viewModeOverride = payload.viewMode;
    }
    return { success: true };
};

/**
 * Reset view mode session state - for testing
 * @internal
 * @deprecated Use sessionUIState.reset() instead
 */
export function resetViewModeOverride(): void {
    sessionUIState.viewModeOverride = undefined;
}

// ============================================================================
// Settings Import/Export Handlers
// ============================================================================

/**
 * Import settings from a JSON file
 *
 * Opens a file picker dialog and parses the selected settings file.
 * Returns the parsed settings to be passed to the wizard.
 */
export const handleImportFromFile: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
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
};

/**
 * Copy settings from an existing project
 *
 * Shows a QuickPick of available projects and extracts settings from the selected one.
 */
export const handleCopyFromExisting: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
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

        // Show QuickPick
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a project to copy settings from',
            title: 'Copy Settings from Project',
            ignoreFocusOut: true,
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
};

/**
 * Handle exporting project settings to a file
 *
 * Shows a save dialog for user to choose location, then writes settings file.
 * User can choose whether to include secrets via a QuickPick.
 */
export const handleExportProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath) {
        return {
            success: false,
            error: 'No project path provided',
        };
    }

    try {
        // Validate path
        try {
            validateProjectPath(payload.projectPath);
        } catch {
            return {
                success: false,
                error: 'Invalid project path',
            };
        }

        // Load the project
        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);

        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        // Get extension version for metadata
        const extension = vscode.extensions.getExtension('AdobeDemoSystem.adobe-demo-builder');
        const extensionVersion = extension?.packageJSON?.version || 'unknown';

        // Create settings using serializer (always include secrets for local export)
        const { createExportSettings, getSuggestedFilename } = await import('../services/settingsSerializer');
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
};
