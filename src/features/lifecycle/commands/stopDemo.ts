/**
 * StopDemoCommand - Stop running demo with event-driven process cleanup
 *
 * Uses ProcessCleanup service for reliable process termination instead of
 * polling-based port checking. This ensures processes actually exit before
 * updating state.
 *
 * Flow:
 * 1. Set status to 'stopping' immediately
 * 2. Find process PID using lsof (by port)
 * 3. Kill process tree using ProcessCleanup (SIGTERM with timeout fallback)
 * 4. Dispose terminal after process killed
 * 5. Update state to 'ready' only after process confirmed dead
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { ProcessCleanup } from '@/core/shell/processCleanup';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DEFAULT_SHELL } from '@/types/shell';

export class StopDemoCommand extends BaseCommand {
    private _processCleanup: ProcessCleanup | null = null;

    /**
     * Get ProcessCleanup instance (lazy initialization)
     *
     * Lazy initialization enables proper mocking in tests.
     */
    private get processCleanup(): ProcessCleanup {
        if (!this._processCleanup) {
            this._processCleanup = new ProcessCleanup({ gracefulTimeout: TIMEOUTS.PROCESS_GRACEFUL_SHUTDOWN });
        }
        return this._processCleanup;
    }

    /**
     * Find process PID listening on the specified port
     *
     * Uses lsof to discover which process is bound to the port.
     * Security: Validates port number before executing shell command.
     *
     * @param port Port number to check (1-65535)
     * @returns PID if found, null otherwise
     */
    private async findProcessByPort(port: number): Promise<number | null> {
        // Security: Validate port number to prevent command injection
        // Note: Number.isInteger() already handles NaN (returns false for NaN)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            this.logger.warn(`[Stop Demo] Invalid port number: ${port}`);
            return null;
        }

        try {
            const commandExecutor = ServiceLocator.getCommandExecutor();
            const result = await commandExecutor.execute(`lsof -ti:${port}`, {
                timeout: TIMEOUTS.PORT_CHECK,
                configureTelemetry: false,
                useNodeVersion: null,
                enhancePath: false,
                shell: DEFAULT_SHELL,
            });

            if (result.code === 0 && result.stdout.trim()) {
                // May return multiple PIDs (parent + children), use first (parent)
                const firstPid = result.stdout.trim().split('\n')[0];
                const pid = parseInt(firstPid, 10);

                if (!isNaN(pid) && pid > 0) {
                    return pid;
                }
            }
        } catch (error) {
            this.logger.debug(`[Stop Demo] No process found on port ${port}:`, error as Error);
        }

        return null;
    }

    /**
     * Dispose terminal by name
     *
     * Finds and disposes all terminals matching the given name.
     * Safe to call even if terminal doesn't exist.
     *
     * @param terminalName Name of terminal to dispose
     */
    private disposeTerminal(terminalName: string): void {
        vscode.window.terminals.forEach(terminal => {
            if (terminal.name === terminalName) {
                terminal.dispose();
            }
        });
    }

    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                // Silently return - no project means nothing to stop
                // (often called programmatically during cleanup/reset)
                this.logger.debug('[Stop Demo] No project found, nothing to stop');
                return;
            }

            // Check if demo is running
            const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
            if (!frontendComponent) {
                this.logger.debug('[Stop Demo] No frontend component, nothing to stop');
                return;
            }

            if (project.status !== 'running' && project.status !== 'starting') {
                this.logger.debug('[Stop Demo] Demo already stopped');
                return;
            }

            await this.withProgress('Stopping demo', async (progress) => {
                // STEP 1: Set status to 'stopping' immediately
                project.status = 'stopping';
                frontendComponent.status = 'stopping';
                await this.stateManager.saveProject(project);
                this.statusBar.updateProject(project);

                // Get port for process discovery
                const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);
                const port = frontendComponent.port || defaultPort;
                const terminalName = `${project.name} - Frontend`;

                // STEP 2: Find process by port
                const pid = await this.findProcessByPort(port);

                // STEP 3: Kill process tree if found
                if (pid) {
                    try {
                        await this.processCleanup.killProcessTree(pid, 'SIGTERM');
                        this.logger.debug(`[Stop Demo] Demo stopped on port ${port}`);
                    } catch (error: any) {
                        if (error.code === 'EPERM') {
                            await this.showError(
                                `Permission denied killing process ${pid}. Try running VS Code as administrator or stop the process manually.`
                            );
                            // Don't update state - process still running
                            // Dispose terminal anyway (attempt cleanup)
                            this.disposeTerminal(terminalName);
                            return;
                        }
                        // Log error but continue - show error and don't update state
                        this.logger.warn(`[Stop Demo] Error killing process:`, error);
                        await this.showError('Failed to stop demo process', error);
                        // Dispose terminal anyway (attempt cleanup)
                        this.disposeTerminal(terminalName);
                        return;
                    }
                } else {
                    this.logger.debug('[Stop Demo] No process found on port, may have already exited');
                }

                // STEP 4: Dispose terminal (cleanup)
                this.disposeTerminal(terminalName);

                // STEP 5: Update project status to 'ready'
                frontendComponent.status = 'stopped';
                project.status = 'ready';

                // Clear frontend env state (config changes don't matter when stopped)
                project.frontendEnvState = undefined;

                await this.stateManager.saveProject(project);

                // Notify extension to reset env change grace period
                await vscode.commands.executeCommand('demoBuilder._internal.demoStopped');

                // Update status bar
                this.statusBar.updateProject(project);

                progress.report({ message: 'Demo stopped successfully!' });
            });

            // Show auto-dismissing success notification (also logs to info channel)
            this.showSuccessMessage('Demo stopped');

        } catch (error) {
            await this.showError('Failed to stop demo', error as Error);
        }
    }
}
