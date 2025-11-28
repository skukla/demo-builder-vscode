import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { toError } from '@/types/typeGuards';

export class DeleteProjectCommand extends BaseCommand {
    /** Maximum number of retry attempts for deletion */
    private readonly MAX_RETRIES = 5;
    /** Base delay in milliseconds for exponential backoff */
    private readonly BASE_DELAY = TIMEOUTS.FILE_DELETE_RETRY_BASE;
    /** Delay for OS to release file handles (watchers, etc.) */
    private readonly HANDLE_RELEASE_DELAY = TIMEOUTS.FILE_HANDLE_RELEASE;

    public async execute(): Promise<void> {
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

                // STEP 1.5: Stop status bar timer BEFORE deleting files
                // This prevents race condition where timer calls getCurrentProject()
                // while files are being deleted, causing spurious reload warnings
                this.statusBar.reset();

                // STEP 2: Delete project files with retry logic
                if (projectPath) {
                    this.logger.debug(`[Delete Project] Deleting directory: ${projectPath}`);

                    // Wait for OS to release file handles (watchers, etc.)
                    await new Promise(resolve => setTimeout(resolve, this.HANDLE_RELEASE_DELAY));

                    // Delete with retry logic for ENOTEMPTY/EBUSY errors
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

                this.logger.info(`Project "${project.name}" deleted`);
            });

            // Show auto-dismissing success message
            this.showSuccessMessage('Project deleted successfully');
            
            // Open Welcome screen to guide user to create a new project
            await vscode.commands.executeCommand('demoBuilder.showWelcome');
            
        } catch (error) {
            await this.showError('Failed to delete project', error as Error);
        }
    }

    /**
     * Delete directory with exponential backoff retry on ENOTEMPTY/EBUSY errors
     *
     * Retries up to MAX_RETRIES times with exponential backoff delays:
     * 100ms, 200ms, 400ms, 800ms, 1600ms
     *
     * This handles transient file locks from:
     * - File watchers releasing handles
     * - Running processes closing files
     * - OS completing async file operations
     *
     * @param path Directory path to delete
     * @throws Error if deletion fails after all retries
     */
    private async deleteWithRetry(path: string): Promise<void> {
        for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
            try {
                await fs.rm(path, { recursive: true, force: true });

                // Verify deletion succeeded
                try {
                    await fs.access(path);
                    // Directory still exists - treat as retryable error
                    throw new Error('ENOTEMPTY: Project directory still exists after deletion attempt');
                } catch (accessError: unknown) {
                    const err = accessError as { code?: string; message?: string };
                    if (err.code === 'ENOENT') {
                        // ENOENT is good - directory is gone
                        return;
                    }
                    // Other error during verification - re-throw to be handled
                    throw accessError;
                }

            } catch (error) {
                const err = toError(error);
                const isRetryable = err.message.includes('ENOTEMPTY') || err.message.includes('EBUSY');

                if (isRetryable && attempt < this.MAX_RETRIES - 1) {
                    // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
                    const delay = this.BASE_DELAY * Math.pow(2, attempt);
                    this.logger.debug('[Delete Project] Waiting for files to be released...');
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else if (isRetryable) {
                    // Last retry failed
                    this.logger.error('[Delete Project] Failed to delete project files after all retries', err);
                    throw new Error(
                        `Failed to delete project directory after ${this.MAX_RETRIES} attempts: ${err.message}`
                    );
                } else {
                    // Non-retryable error (permission denied, etc.)
                    this.logger.error('[Delete Project] Failed to delete project files', err);
                    throw new Error(`Failed to delete project directory: ${err.message}`);
                }
            }
        }
    }
}