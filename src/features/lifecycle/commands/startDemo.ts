import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { ProcessCleanup } from '@/core/shell/processCleanup';
import { updateFrontendState } from '@/core/state';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateNodeVersion } from '@/core/validation/securityValidation';
import { DEFAULT_SHELL } from '@/types/shell';
import { getComponentIds, getComponentInstanceValues } from '@/types/typeGuards';

/**
 * Command to start the demo frontend server
 *
 * Features:
 * - Validates project and frontend component exist
 * - Checks port availability before starting
 * - Resolves port conflicts using ProcessCleanup (event-driven, no hardcoded delays)
 * - Waits for demo to actually start (polls until port is in use)
 * - Graceful timeout handling (30 seconds) with user warning
 * - State updates reflect actual process state, not just "commands were sent"
 */
export class StartDemoCommand extends BaseCommand {
    /** ProcessCleanup instance for event-driven process termination */
    private _processCleanup: ProcessCleanup | null = null;

    /** Maximum time to wait for demo to start */
    private readonly STARTUP_TIMEOUT = TIMEOUTS.DEMO_STARTUP_TIMEOUT;

    /** Interval between port availability checks */
    private readonly PORT_CHECK_INTERVAL = TIMEOUTS.PORT_CHECK_INTERVAL;

    /**
     * Get ProcessCleanup instance (lazy initialization)
     */
    private get processCleanup(): ProcessCleanup {
        if (!this._processCleanup) {
            this._processCleanup = new ProcessCleanup({ gracefulTimeout: TIMEOUTS.PROCESS_GRACEFUL_SHUTDOWN });
        }
        return this._processCleanup;
    }

    /**
     * Wait for port to be in use (demo started)
     *
     * Polls isPortAvailable until port is detected in use,
     * indicating the demo server has started listening.
     *
     * @param port Port to check
     * @param timeoutMs Maximum time to wait (default: STARTUP_TIMEOUT)
     * @returns true if port is in use (demo started), false if timeout
     */
    private async waitForPortInUse(port: number, timeoutMs: number = this.STARTUP_TIMEOUT): Promise<boolean> {
        const commandManager = ServiceLocator.getCommandExecutor();
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const available = await commandManager.isPortAvailable(port);
            if (!available) {
                // Port is in use = demo started
                this.logger.debug(`[Start Demo] Demo started on port ${port} after ${Date.now() - startTime}ms`);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, this.PORT_CHECK_INTERVAL));
        }

        // Timeout - port never became in use
        this.logger.warn(`[Start Demo] Timeout waiting for port ${port} to be in use after ${timeoutMs}ms`);
        return false;
    }

    /**
     * Kill process on port using ProcessCleanup (event-driven)
     *
     * Uses lsof to find the process PID, then ProcessCleanup.killProcessTree
     * for reliable, event-driven process termination. No hardcoded delays.
     *
     * @param port Port number to find and kill process
     * @returns true if process was found and killed, false otherwise
     * @throws Error if ProcessCleanup fails (e.g., EPERM)
     */
    private async killProcessOnPort(port: number): Promise<boolean> {
        const commandManager = ServiceLocator.getCommandExecutor();

        // Find PID using lsof
        const result = await commandManager.execute(`lsof -ti:${port}`, {
            timeout: TIMEOUTS.PORT_CHECK,
            configureTelemetry: false,
            useNodeVersion: null,
            enhancePath: false,
            shell: DEFAULT_SHELL,
        });

        if (result.code !== 0 || !result.stdout.trim()) {
            this.logger.debug(`[Start Demo] No process found on port ${port}`);
            return false;
        }

        // Parse PID (first line if multiple)
        const pid = parseInt(result.stdout.trim().split('\n')[0], 10);
        if (isNaN(pid) || pid <= 0) {
            this.logger.warn(`[Start Demo] Invalid PID from lsof: ${result.stdout}`);
            return false;
        }

        this.logger.debug(`[Start Demo] Killing process tree for PID ${pid} on port ${port}`);

        // Kill with ProcessCleanup (event-driven, no hardcoded delay)
        await this.processCleanup.killProcessTree(pid, 'SIGTERM');

        this.logger.info(`[Start Demo] Process ${pid} terminated successfully`);
        return true;
    }
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found. Create a project first.');
                const create = await vscode.window.showInformationMessage(
                    'No Demo Builder project found.',
                    'Create Project',
                    'Cancel',
                );
                if (create === 'Create Project') {
                    await vscode.commands.executeCommand('demoBuilder.createProject');
                }
                return;
            }

            // Check if demo is already running
            if (project.status === 'running') {
                await this.showInfo('Demo is already running');
                return;
            }

            // Pre-flight check: port availability (outside progress to allow user interaction)
            const commandManager = ServiceLocator.getCommandExecutor();
            const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
            
            // Get port: use component's configured port, fallback to extension setting, then 3000
            const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);
            const port = frontendComponent?.port || defaultPort;

            // SECURITY: Validate port number to prevent command injection
            // Port must be a number between 1 and 65535
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                this.logger.error(`[Start Demo] Invalid port number: ${port}`);
                await this.showError(`Invalid port number: ${port}. Must be between 1 and 65535.`);
                return;
            }

            const portAvailable = await commandManager.isPortAvailable(port);
            if (!portAvailable) {
                // Find out what's running on the port
                let processInfo = 'Unknown process';
                try {
                    // SECURITY: port is validated above as a valid integer
                    const result = await commandManager.execute(`lsof -i:${port}`, {
                        timeout: TIMEOUTS.PORT_CHECK,
                        configureTelemetry: false,
                        useNodeVersion: null,
                        enhancePath: false,
                        shell: DEFAULT_SHELL,  // Required for command syntax
                    });
                    
                    if (result.code === 0 && result.stdout) {
                        // Parse lsof output (skip header line, take first process line)
                        const lines = result.stdout.trim().split('\n');
                        if (lines.length > 1) {
                            const processLine = lines[1].trim();
                            const parts = processLine.split(/\s+/);
                            const processName = parts[0] || 'Unknown';
                            const pid = parts[1] || 'Unknown';
                            processInfo = `${processName} (PID: ${pid})`;
                        }
                    }
                } catch (error) {
                    this.logger.warn(`[Start Demo] Could not identify process on port ${port}:`, error as Error);
                }
                
                this.logger.warn(`[Start Demo] Port ${port} is in use by: ${processInfo}`);
                
                // Ask user if they want to stop the process
                const action = await vscode.window.showWarningMessage(
                    `Port ${port} in use by ${processInfo}. Stop it and start demo?`,
                    'Stop & Start',
                    'Cancel',
                );
                
                if (action !== 'Stop & Start') {
                    this.logger.debug('[Start Demo] User cancelled demo start due to port conflict');
                    return;
                }

                // Kill the process using ProcessCleanup (event-driven, no hardcoded delay)
                this.logger.debug(`[Start Demo] Stopping process on port ${port}...`);
                try {
                    await this.killProcessOnPort(port);
                    this.logger.info('[Start Demo] Process stopped successfully');
                } catch (error) {
                    this.logger.error('[Start Demo] Failed to stop process:', error as Error);
                    await this.showError(`Failed to stop process on port ${port}. Try stopping it manually.`);
                    return;
                }
            }

            await this.withProgress('Starting demo', async (progress) => {
                // Validate frontend component
                if (!frontendComponent?.path) {
                    const debugInfo = JSON.stringify({
                        hasComponentInstances: !!project.componentInstances,
                        componentKeys: getComponentIds(project.componentInstances),
                        frontendComponent: frontendComponent,
                    });
                    this.logger.error(`[Start Demo] Frontend component not found: ${debugInfo}`);
                    await this.showError('Frontend component not found or path not set');
                    return;
                }
                
                const frontendPath = frontendComponent.path;
                // Extract nodeVersion from metadata with proper type coercion
                const rawNodeVersion = frontendComponent.metadata?.nodeVersion;
                const nodeVersion = typeof rawNodeVersion === 'string' ? rawNodeVersion : '20';

                // SECURITY: Validate nodeVersion before using in terminal command
                // Prevents command injection (CWE-77) if project state is corrupted
                try {
                    validateNodeVersion(nodeVersion);
                } catch (error) {
                    this.logger.error(`[Start Demo] Invalid Node version: ${nodeVersion}`);
                    await this.showError(`Invalid Node version "${nodeVersion}". Must be a number like 18, 20, or semver like 20.11.0`);
                    return;
                }

                this.logger.debug(`[Start Demo] Starting demo in: ${frontendPath}`);
                this.logger.debug(`[Start Demo] Using Node ${nodeVersion}`);
                
                // Set status to 'starting' immediately
                project.status = 'starting';
                frontendComponent.status = 'starting';
                frontendComponent.port = port;
                await this.stateManager.saveProject(project);
                this.statusBar.updateProject(project);
                
                // Create project-specific terminal name (allows us to identify which project is running)
                const terminalName = `${project.name} - Frontend`;
                const terminal = this.createTerminal(terminalName);
                
                // Navigate to frontend directory and start
                terminal.sendText(`cd "${frontendPath}"`);
                terminal.sendText(`fnm use ${nodeVersion} && npm run dev`);

                // Wait for demo to actually start (poll until port is in use)
                const started = await this.waitForPortInUse(port);

                if (!started) {
                    // Timeout - demo didn't start within expected time
                    this.logger.warn('[Start Demo] Demo startup timed out - port not in use');
                    await this.showWarning('Demo startup timed out. Check the terminal for errors.');
                    // Status remains 'starting' - user can check terminal
                    return;
                }

                // Demo started successfully - update status to 'running'
                frontendComponent.status = 'running';
                project.status = 'running';

                // Capture frontend env vars for change detection
                updateFrontendState(project);

                await this.stateManager.saveProject(project);
                
                // Notify extension to suppress env change notifications during startup
                await vscode.commands.executeCommand('demoBuilder._internal.demoStarted');
                
                // Initialize file hashes for change detection (capture baseline state)
                // Find all .env files in component directories
                const envFiles: string[] = [];

                // Collect .env files from all component instances
                // SOP §4: Using helper instead of inline Object.values
                for (const componentInstance of getComponentInstanceValues(project)) {
                    if (componentInstance.path) {
                        const componentPath = componentInstance.path;
                        const envPath = path.join(componentPath, '.env');
                        const envLocalPath = path.join(componentPath, '.env.local');

                        // Check if files exist using static fs import
                        try {
                            await fs.promises.access(envPath);
                            envFiles.push(envPath);
                        } catch {
                            // File doesn't exist
                        }

                        try {
                            await fs.promises.access(envLocalPath);
                            envFiles.push(envLocalPath);
                        } catch {
                            // File doesn't exist
                        }
                    }
                }
                
                if (envFiles.length > 0) {
                    await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', envFiles);
                }
                
                // Update status bar
                this.statusBar.updateProject(project);

                // Update notification in place and pause briefly so user can see success
                progress.report({ message: `✓ Started at http://localhost:${port}` });
                await new Promise(resolve => setTimeout(resolve, TIMEOUTS.LOADING_MIN_DISPLAY));
            });

            // Reset restart notification flag (user has restarted)
            await vscode.commands.executeCommand('demoBuilder._internal.restartActionTaken');
            
        } catch (error) {
            await this.showError('Failed to start demo', error as Error);
        }
    }
}