import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { BaseCommand, BaseWebviewCommand } from '@/core/base';
import { ExecutionLock, TIMEOUTS } from '@/core/utils';
import { toError } from '@/types/typeGuards';

export class DeleteProjectCommand extends BaseCommand {
    /** Maximum number of retry attempts for deletion */
    private readonly MAX_RETRIES = 5;
    /** Base delay in milliseconds for exponential backoff */
    private readonly BASE_DELAY = TIMEOUTS.FILE_DELETE_RETRY_BASE;
    /** Delay for OS to release file handles (watchers, etc.) */
    private readonly HANDLE_RELEASE_DELAY = TIMEOUTS.FILE_HANDLE_RELEASE;

    /** Execution lock to prevent duplicate concurrent execution */
    private static lock = new ExecutionLock('DeleteProject');

    public async execute(): Promise<void> {
        // Prevent duplicate concurrent execution
        if (DeleteProjectCommand.lock.isLocked()) {
            this.logger.debug('[Delete Project] Already in progress');
            return;
        }

        let deleted = false;
        await DeleteProjectCommand.lock.run(async () => {
            try {
                const project = await this.stateManager.getCurrentProject();
                if (!project) {
                    await this.showWarning('No project found to delete.');
                    return;
                }

                const confirm = await this.confirm(
                    `Are you sure you want to delete project "${project.name}"?`,
                    'This will remove all project files and configuration. This action cannot be undone.',
                );

                if (!confirm) {
                    return;
                }

                await this.withProgress('Deleting project', async (_progress) => {
                    // STEP 1: Stop demo if running
                    if (project.status === 'running') {
                        await vscode.commands.executeCommand('demoBuilder.stopDemo');
                        // No fixed grace period - stopDemo now waits for actual process exit
                    }

                    // Save project path before clearing state
                    const projectPath = project.path;

                    // STEP 2: Delete project files with retry logic
                    if (projectPath) {
                        this.logger.debug(`[Delete Project] Deleting directory: ${projectPath}`);

                        // Wait for OS to release file handles (watchers, etc.)
                        await new Promise(resolve => setTimeout(resolve, this.HANDLE_RELEASE_DELAY));

                        // Delete with retry logic for transient filesystem errors
                        // No post-deletion verification needed - fs.rm() success means deletion complete
                        await this.deleteWithRetry(projectPath);
                    }

                    // STEP 3: Remove from recent projects list
                    if (projectPath) {
                        await this.stateManager.removeFromRecentProjects(projectPath);
                    }

                    // STEP 4: Clear state
                    await this.stateManager.clearProject();

                    // Note: Status bar already reset in step 1.5 (before file deletion)
                    // to prevent race condition with timer-based getCurrentProject() calls
                });

                // Show auto-dismissing success notification (also logs to info channel)
                this.showSuccessMessage(`Project "${project.name}" deleted`);
                deleted = true;

            } catch (error) {
                await this.showError('Failed to delete project', error as Error);
            }
        });

        // Post-work only runs on successful deletion
        if (deleted) {
            // Use webview transition lock to prevent disposal callbacks from firing
            // This prevents race condition where Dashboard disposal interferes with
            // Projects List initialization (causes blank webview)
            await BaseWebviewCommand.startWebviewTransition();
            try {
                // Close project-related panels (dashboard, configure) before navigation
                this.closeProjectPanels();

                // Navigate to Projects List (sidebar shows all projects)
                await vscode.commands.executeCommand('demoBuilder.showProjectsList');
            } catch {
                // Ignore - projects list is optional post-deletion
                this.logger.debug('[Delete Project] Projects List failed to open (non-critical)');
            } finally {
                BaseWebviewCommand.endWebviewTransition();
            }
        }
    }

    /**
     * Close project-related webview panels
     *
     * Disposes dashboard and configure panels so they don't show stale
     * project data after deletion.
     */
    private closeProjectPanels(): void {
        const panelIds = ['demoBuilder.projectDashboard', 'demoBuilder.configureProject'];

        for (const panelId of panelIds) {
            try {
                const panel = BaseWebviewCommand.getActivePanel(panelId);
                if (panel) {
                    panel.dispose();
                    this.logger.debug(`[Delete Project] Closed ${panelId} panel`);
                }
            } catch {
                // Ignore - panel may already be disposed
            }
        }
    }

    /**
     * Delete directory with exponential backoff retry on transient filesystem errors
     *
     * Retries up to MAX_RETRIES times with exponential backoff delays:
     * 100ms, 200ms, 400ms, 800ms, 1600ms
     *
     * This handles transient file locks from:
     * - File watchers releasing handles
     * - Running processes closing files
     * - OS completing async file operations
     * - Antivirus/cloud sync temporary locks
     *
     * Retryable error codes (per Node.js fs.rm documentation):
     * - EBUSY: Resource busy (file in use)
     * - ENOTEMPTY: Directory not empty (async unlink not complete)
     * - EPERM: Permission error (temporary lock from antivirus/sync)
     * - EMFILE: Too many open files in system
     * - ENFILE: Too many open files
     *
     * @param path Directory path to delete
     * @throws Error if deletion fails after all retries
     */
    private async deleteWithRetry(path: string): Promise<void> {
        const RETRYABLE_CODES = ['EBUSY', 'ENOTEMPTY', 'EPERM', 'EMFILE', 'ENFILE'];

        for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
            try {
                this.logger.debug(`[Delete Project] Attempt ${attempt + 1}/${this.MAX_RETRIES}: calling fs.rm`);
                await fs.rm(path, { recursive: true, force: true });
                // fs.rm() success means deletion complete - no verification needed
                this.logger.debug(`[Delete Project] Deletion successful`);
                return;

            } catch (error) {
                const err = toError(error);
                const code = (error as NodeJS.ErrnoException).code;
                const isRetryable = code !== undefined && RETRYABLE_CODES.includes(code);

                this.logger.debug(`[Delete Project] Error: ${code} - ${err.message} (retryable: ${isRetryable})`);

                if (isRetryable && attempt < this.MAX_RETRIES - 1) {
                    // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
                    const delay = this.BASE_DELAY * Math.pow(2, attempt);
                    this.logger.debug(`[Delete Project] Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else if (isRetryable) {
                    // Last retry failed
                    this.logger.error('[Delete Project] Failed to delete project files after all retries', err);
                    throw new Error(
                        `Failed to delete project directory after ${this.MAX_RETRIES} attempts: ${err.message}`,
                    );
                } else {
                    // Non-retryable error (e.g., EACCES - actual permission denied)
                    this.logger.error('[Delete Project] Failed to delete project files', err);
                    throw new Error(`Failed to delete project directory: ${err.message}`);
                }
            }
        }
    }
}