/**
 * SettingsTransferService
 *
 * Handles settings import, export, and copy operations for projects.
 * Supports importing from files, copying from existing projects, and exporting.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    copySeedFromProject,
    createExportSettings,
    getSuggestedFilename,
} from './settingsSerializer';
import { readProjectFile } from '@/core/state/projectFileReader';
import { showWebviewQuickPick } from '@/core/utils/quickPickUtils';
import { writeFileAtomic } from '@/core/utils/writeFileAtomic';
import { assertPathInsideSync } from '@/core/validation/PathSafetyValidator';
import { askForDetailsDuringOperation, modalIsAsking } from '@/core/vscode/operationPrompt';
import { getProjectDescription } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/**
 * Import settings from a JSON file
 *
 * Opens a file picker dialog and parses the selected settings file.
 * Returns the parsed settings to be passed to the wizard.
 */
export async function importSettingsFromFile(context: HandlerContext): Promise<HandlerResponse> {
    const fileUri = await pickImportFile(context);
    if (!fileUri) {
        return { success: true, data: { success: false, error: 'cancelled' } };
    }
    return importSettingsFromUri(context, fileUri);
}

/**
 * The Import picker: a settings file, or a demo bundle (what Export's "Send a
 * file" writes). The caller branches on the extension.
 *
 * @returns The picked file, or nothing when dismissed
 */
export async function pickImportFile(context: HandlerContext): Promise<vscode.Uri | undefined> {
    context.logger.info('Opening file picker for import');
    const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
            'Demo Builder settings or bundle': ['json', 'zip'],
            'All Files': ['*'],
        },
        title: 'Import a settings file or a demo bundle',
    });
    return fileUris?.[0];
}

/**
 * Import a settings JSON file and open the wizard pre-filled from it.
 *
 * @param context - Handler context
 * @param fileUri - The settings file
 * @returns `{ success, data }` in the shape the projects list reads
 */
export async function importSettingsFromUri(context: HandlerContext, fileUri: vscode.Uri): Promise<HandlerResponse> {
    try {
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        const jsonString = Buffer.from(fileContent).toString('utf8');

        // The one reader: a version-2 file passes through, a version-1 file
        // migrates, credentials are stripped whatever the file claims.
        const read = readProjectFile(jsonString);
        if (!read.ok) {
            return {
                success: true,
                data: {
                    success: false,
                    error: read.error,
                },
            };
        }

        const settings = read.file;
        if (read.newerThanSupported) {
            context.logger.warn(
                `Project file version ${settings.version} is newer than this build; what it understands was used`,
            );
        }

        context.logger.info(`Imported settings from file: ${fileUri.fsPath}`);

        // Launch wizard with imported settings
        await vscode.commands.executeCommand('demoBuilder.createProject', {
            importedSettings: settings,
            sourceDescription: vscode.workspace.asRelativePath(fileUri),
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
        context.logger.error(
            'Failed to import settings from file',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to import settings file',
        };
    }
}

/**
 * Which project to copy from: in the projects list's modal when it started the
 * copy (picker-to-modal), else a QuickPick. Undefined when the SC cancelled.
 */
async function pickSourceProject(projects: Project[], inModal: boolean): Promise<Project | undefined> {
    if (inModal) {
        const asked = await askForDetailsDuringOperation({
            message: 'Start a new project with the settings of one you already have.',
            fields: [
                {
                    id: 'project',
                    label: 'Copy settings from',
                    kind: 'choice',
                    options: projects.map((project) => ({
                        id: project.path,
                        label: `${project.name} — ${getProjectDescription(project)}`,
                    })),
                },
            ],
            actions: ['Copy settings'],
        });
        if (asked.action !== 'Copy settings') return undefined;
        return projects.find((project) => project.path === asked.values.project);
    }
    const items: vscode.QuickPickItem[] = projects.map((project) => ({
        label: project.name,
        description: getProjectDescription(project),
        detail: project.path,
    }));
    // Webview-safe utility for proper keyboard handling.
    const selected = await showWebviewQuickPick(items, {
        title: 'Copy Settings from Project',
        placeholder: 'Select a project to copy settings from',
    });
    return selected ? projects.find((project) => project.path === selected.detail) : undefined;
}

/**
 * Copy settings from an existing project
 *
 * Asks which project (see `pickSourceProject`) and extracts settings from it.
 */
export async function copySettingsFromProject(context: HandlerContext): Promise<HandlerResponse> {
    try {
        context.logger.info('Opening project picker for settings copy');

        // Get all projects (read-only, do not persist after load)
        const projectList = await context.stateManager.getAllProjects();
        const projects: Project[] = [];

        for (const item of projectList) {
            const project = await context.stateManager.loadProjectFromPath(item.path, undefined, {
                persistAfterLoad: false,
            });
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

        const sourceProject = await pickSourceProject(projects, modalIsAsking());
        if (!sourceProject) {
            // User cancelled
            return {
                success: true,
                data: { success: false, error: 'cancelled' },
            };
        }

        // The file Import would read for this project, read the same way (PL-56e).
        const read = copySeedFromProject(sourceProject);
        if (!read.ok) {
            return { success: true, data: { success: false, error: read.error } };
        }
        const settings = read.file;

        context.logger.info(`Copying settings from project: ${sourceProject.name}`);

        // Launch wizard with copied settings
        await vscode.commands.executeCommand('demoBuilder.createProject', {
            importedSettings: settings,
            sourceDescription: sourceProject.name,
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
        context.logger.error(
            'Failed to copy settings from project',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to copy settings from project',
        };
    }
}

export const OPEN_EXPORT = 'Open File';

/** VS Code's own label for revealFileInOS on each platform. */
export function revealLabel(platform: NodeJS.Platform = process.platform): string {
    if (platform === 'darwin') return 'Reveal in Finder';
    if (platform === 'win32') return 'Reveal in File Explorer';
    return 'Open Containing Folder';
}

function displayPath(fsPath: string): string {
    const home = os.homedir();
    return home && fsPath.startsWith(home + path.sep) ? `~${fsPath.slice(home.length)}` : fsPath;
}

/** Says where the file went and offers to open it or show it in the OS. */
async function announceExport(projectName: string, uri: vscode.Uri): Promise<void> {
    const reveal = revealLabel();
    const choice = await vscode.window.showInformationMessage(
        `${projectName} exported to ${displayPath(uri.fsPath)}`,
        OPEN_EXPORT,
        reveal,
    );
    if (choice === OPEN_EXPORT) {
        await vscode.commands.executeCommand('vscode.open', uri);
    } else if (choice === reveal) {
        await vscode.commands.executeCommand('revealFileInOS', uri);
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

        const settings = createExportSettings(project, extensionVersion);
        const suggestedFilename = getSuggestedFilename(project.name);

        // Show save dialog
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(suggestedFilename),
            filters: {
                'Demo Builder project': ['json'],
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

        // A plain message, not a progress bar with a sleep in it: nothing is in
        // progress, and the SC dismisses it when they have read it.
        void announceExport(project.name, saveUri);

        return {
            success: true,
            data: {
                success: true,
                filePath: saveUri.fsPath,
            },
        };
    } catch (error) {
        context.logger.error(
            'Failed to export project settings',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to export project settings',
        };
    }
}

/** Result of a headless settings export: where the credential-free file went. */
export interface ExportSettingsToFileResult {
    /** Absolute path the settings JSON was written to. */
    path: string;
    /** Confirmation sentence for agents — the write completed; how to re-check. */
    verify: string;
}

/**
 * Export a project's settings to a JSON file on disk, headlessly (no save dialog).
 *
 * Backs the `export_project_settings` MCP tool. The file carries no credential
 * (`createExportSettings`), and the return value is just the path.
 *
 * The target must resolve INSIDE the project directory; traversal or writes to an
 * arbitrary location are rejected by {@link assertPathInsideSync}. Default target:
 * `<project>/<name>.project.demo-builder.json`.
 */
export async function exportProjectSettingsToFile(
    project: Project,
    opts: { path?: string } = {},
): Promise<ExportSettingsToFileResult> {
    const extension = vscode.extensions.getExtension('AdobeDemoSystem.adobe-demo-builder');
    const extensionVersion = extension?.packageJSON?.version || 'unknown';
    const settings = createExportSettings(project, extensionVersion);

    const target = resolveExportTarget(project, opts.path);
    await writeFileAtomic(target, JSON.stringify(settings, null, 2));

    return {
        path: target,
        // The write is complete when this returns (writeFileAtomic) — say so,
        // or agents ls the directory to make sure (measured, tier-2 battery).
        verify: 'Confirmed — the file exists at `path`; Read it directly if you need the contents.',
    };
}

/**
 * Resolve and containment-check the export target. A relative path resolves
 * against the project dir; an absolute one must already be inside it. An existing
 * directory target gets the default filename appended.
 */
function resolveExportTarget(project: Project, providedPath?: string): string {
    const projectDir = project.path;
    const defaultName = getSuggestedFilename(project.name);

    let candidate: string;
    if (!providedPath) {
        candidate = path.join(projectDir, defaultName);
    } else if (path.isAbsolute(providedPath)) {
        candidate = providedPath;
    } else {
        candidate = path.join(projectDir, providedPath);
    }

    try {
        if (fs.statSync(candidate).isDirectory()) {
            candidate = path.join(candidate, defaultName);
        }
    } catch {
        // Target doesn't exist yet — treat it as a file path.
    }

    // Reject traversal / writes outside the project directory.
    return assertPathInsideSync(candidate, projectDir);
}
