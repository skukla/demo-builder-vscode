import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { Logger } from './logger';
import { getLogger, CommandResult } from './debugLogger';
import { execWithEnhancedPath } from './shellHelper';

const execAsync = promisify(exec);

export interface AdobeOrg {
    id: string;
    code: string;
    name: string;
}

export interface AdobeProject {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string;
    org_id?: number;
}

export interface AdobeWorkspace {
    id: string;
    name: string;
    title?: string;
}

export class AdobeAuthManager {
    private logger: Logger;
    private debugLogger = getLogger();

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async isAuthenticated(): Promise<boolean> {
        const startTime = Date.now();
        try {
            this.debugLogger.debug('Starting Adobe authentication check');
            
            // IMPORTANT: Only check for token existence, don't run any commands that might trigger login
            // Check for access token in the config
            const command = 'aio config get ims.contexts.cli.access_token.token';
            this.debugLogger.debug(`Executing: ${command}`);
            const { stdout: token, stderr } = await execWithEnhancedPath(command);
            
            const result: CommandResult = {
                stdout: token,
                stderr,
                code: 0,
                duration: Date.now() - startTime,
                cwd: process.cwd()
            };
            this.debugLogger.logCommand(command, result);
            
            if (!token || !token.trim() || token.trim() === 'undefined' || token.trim() === 'null') {
                // No token found
                this.debugLogger.debug('Auth check result: No token found or token is undefined/null');
                return false;
            }
            
            // We have a token, try to check expiry if available
            try {
                const expiryCommand = 'aio config get ims.contexts.cli.access_token.expiry';
                this.debugLogger.debug(`Checking token expiry with: ${expiryCommand}`);
                const { stdout: expiry, stderr: expiryStderr } = await execWithEnhancedPath(expiryCommand);
                
                this.debugLogger.logCommand(expiryCommand, {
                    stdout: expiry,
                    stderr: expiryStderr,
                    code: 0,
                    duration: Date.now() - startTime
                });
                
                if (expiry && expiry.trim() && expiry.trim() !== 'undefined') {
                    this.debugLogger.debug(`Raw expiry value: '${expiry.trim()}'`);
                    const expiryTime = parseInt(expiry.trim());
                    
                    if (!isNaN(expiryTime)) {
                        const now = Date.now();
                        const isValid = expiryTime > now;
                        
                        this.debugLogger.debug('Token expiry check:', {
                            expiryTime,
                            currentTime: now,
                            expiresAt: new Date(expiryTime).toISOString(),
                            currentAt: new Date(now).toISOString(),
                            isValid
                        });
                        
                        this.logger.info(`Token expiry check: expires at ${expiryTime}, now ${now}, valid: ${isValid}`);
                        return isValid;
                    } else {
                        this.debugLogger.debug('Failed to parse expiry time as integer');
                    }
                } else {
                    this.debugLogger.debug('No expiry value found or value is undefined');
                }
            } catch (expiryError) {
                // Expiry check failed, but we have a token
                this.debugLogger.debug('Expiry check failed:', expiryError);
                this.logger.info('Have token but cannot verify expiry, assuming valid');
            }
            
            // We have a token but can't verify expiry, assume it's valid
            // This is better than triggering an interactive login
            return true;
            
        } catch (error) {
            // Config check failed - not authenticated
            this.debugLogger.debug('Auth check failed with error:', error);
            this.logger.warn('Adobe auth check failed - not authenticated');
            return false;
        } finally {
            const totalDuration = Date.now() - startTime;
            this.debugLogger.debug(`Total auth check duration: ${totalDuration}ms`);
        }
    }

    public async login(): Promise<boolean> {
        try {
            this.logger.info('Starting Adobe login...');
            this.debugLogger.debug('Initiating Adobe login with browser');
            
            const command = 'aio auth login -f';
            this.debugLogger.debug(`Executing (non-blocking): ${command}`);
            
            // Execute with enhanced PATH to find aio
            const fullCommand = `eval "$(fnm env)" 2>/dev/null; ${command}`;
            exec(fullCommand, { shell: '/bin/zsh' }, (error, stdout, stderr) => {
                // This callback happens after browser opens
                // Error is expected as the command waits for auth
                const result: CommandResult = {
                    stdout: stdout || '',
                    stderr: stderr || '',
                    code: error?.code || 0,
                    env: process.env
                };
                
                this.debugLogger.logCommand(`${command} (callback)`, result);
                
                if (stdout) this.logger.info(`Login output: ${stdout}`);
                if (stderr && !stderr.includes('Opening browser')) {
                    this.logger.warn(`Login stderr: ${stderr}`);
                }
                
                if (error) {
                    this.debugLogger.debug('Login command error (may be expected):', error);
                }
            });
            
            this.debugLogger.debug('Login command initiated, browser should open');
            return true; // Return true to indicate login was initiated
        } catch (error) {
            this.debugLogger.debug('Login initiation failed:', error);
            this.logger.error('Adobe login failed', error as Error);
            return false;
        }
    }

    public async forceLogin(): Promise<boolean> {
        try {
            this.logger.info('Forcing fresh Adobe login...');
            this.debugLogger.debug('Starting force login process');
            
            // Force logout first, then login with force flag
            const logoutCommand = 'aio auth logout --force';
            this.debugLogger.debug(`Executing logout: ${logoutCommand}`);
            const { stdout: logoutOut, stderr: logoutErr } = await execWithEnhancedPath(logoutCommand);
            
            this.debugLogger.logCommand(logoutCommand, {
                stdout: logoutOut,
                stderr: logoutErr,
                code: 0,
                duration: 0
            });
            
            // Longer delay to ensure logout completes and token is fully cleared
            this.debugLogger.debug('Waiting 1.5s for logout to complete...');
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const loginCommand = 'aio auth login -f';
            this.debugLogger.debug(`Executing (non-blocking): ${loginCommand}`);
            
            // Don't await - let it run in background as browser opens
            const fullLoginCommand = `eval "$(fnm env)" 2>/dev/null; ${loginCommand}`;
            exec(fullLoginCommand, { shell: '/bin/zsh' }, (error, stdout, stderr) => {
                // This callback happens after browser opens
                // Error is expected as the command waits for auth
                const result: CommandResult = {
                    stdout: stdout || '',
                    stderr: stderr || '',
                    code: error?.code || 0,
                    env: process.env
                };
                
                this.debugLogger.logCommand(`${loginCommand} (callback)`, result);
                
                if (stdout) this.logger.info(`Force login output: ${stdout}`);
                if (stderr && !stderr.includes('Opening browser')) {
                    this.logger.warn(`Force login stderr: ${stderr}`);
                }
                
                if (error) {
                    this.debugLogger.debug('Force login command error (may be expected):', error);
                }
            });
            
            this.debugLogger.debug('Force login command initiated, browser should open');
            return true; // Return true to indicate login was initiated
        } catch (error) {
            this.debugLogger.debug('Force login initiation failed:', error);
            this.logger.error('Adobe force login failed', error as Error);
            return false;
        }
    }

    public async logout(): Promise<void> {
        try {
            await execWithEnhancedPath('aio auth logout');
            this.logger.info('Adobe logout successful');
        } catch (error) {
            this.logger.warn('Adobe logout failed:', error);
        }
    }

    public async verifyAccess(): Promise<boolean> {
        try {
            // Try to list organizations as a verification step
            const { stdout } = await execWithEnhancedPath('aio console org list');
            return stdout.includes('Org ID') || stdout.includes('Org Name');
        } catch (error) {
            this.logger.warn('Failed to verify Adobe access');
            return false;
        }
    }

    public async getOrganizations(): Promise<AdobeOrg[]> {
        try {
            const { stdout } = await execWithEnhancedPath('aio console org list --json');
            // Parse JSON, removing any status messages
            const jsonStr = stdout.split('\n').find(line => line.startsWith('['));
            if (!jsonStr) return [];
            return JSON.parse(jsonStr);
        } catch (error) {
            this.logger.error('Failed to get Adobe organizations', error as Error);
            return [];
        }
    }

    public async selectOrganization(orgCode: string): Promise<boolean> {
        try {
            await execWithEnhancedPath(`aio console org select ${orgCode}`);
            this.logger.info(`Selected Adobe organization: ${orgCode}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to select Adobe organization', error as Error);
            return false;
        }
    }

    public async getProjects(orgId?: string): Promise<AdobeProject[]> {
        try {
            const orgFlag = orgId ? `--orgId ${orgId}` : '';
            const { stdout } = await execWithEnhancedPath(`aio console project list --json ${orgFlag}`);
            // Parse JSON, removing any status messages
            const jsonStr = stdout.split('\n').find(line => line.startsWith('['));
            if (!jsonStr) return [];
            return JSON.parse(jsonStr);
        } catch (error) {
            this.logger.error('Failed to get Adobe projects', error as Error);
            return [];
        }
    }

    public async selectProject(projectId: string): Promise<boolean> {
        try {
            await execWithEnhancedPath(`aio console project select ${projectId}`);
            this.logger.info(`Selected Adobe project: ${projectId}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to select Adobe project', error as Error);
            return false;
        }
    }

    public async getWorkspaces(projectId?: string): Promise<AdobeWorkspace[]> {
        try {
            const projectFlag = projectId ? `--projectId ${projectId}` : '';
            const { stdout } = await execWithEnhancedPath(`aio console workspace list --json ${projectFlag}`);
            // Parse JSON, removing any status messages
            const jsonStr = stdout.split('\n').find(line => line.startsWith('['));
            if (!jsonStr) return [];
            return JSON.parse(jsonStr);
        } catch (error) {
            this.logger.error('Failed to get Adobe workspaces', error as Error);
            return [];
        }
    }

    public async selectWorkspace(workspaceId: string): Promise<boolean> {
        try {
            await execWithEnhancedPath(`aio console workspace select ${workspaceId}`);
            this.logger.info(`Selected Adobe workspace: ${workspaceId}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to select Adobe workspace', error as Error);
            return false;
        }
    }

    public async importConsoleJson(filePath: string): Promise<any> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const config = JSON.parse(content);
            
            // Extract relevant information from console.json
            return {
                projectId: config.project?.id,
                projectName: config.project?.title,
                organization: config.project?.org?.name,
                workspace: config.project?.workspace?.name || 'Stage',
                authenticated: true
            };
        } catch (error) {
            this.logger.error('Failed to import console.json', error as Error);
            throw error;
        }
    }
}