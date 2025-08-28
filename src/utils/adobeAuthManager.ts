import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { Logger } from './logger';

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

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async isAuthenticated(): Promise<boolean> {
        try {
            // Try to get access token in bare mode - this will fail if not authenticated
            await execAsync('aio auth login -b');
            return true;
        } catch (error) {
            this.logger.warn('Adobe auth check failed - not authenticated');
            return false;
        }
    }

    public async login(): Promise<boolean> {
        try {
            await execAsync('aio auth login');
            return await this.isAuthenticated();
        } catch (error) {
            this.logger.error('Adobe login failed', error as Error);
            return false;
        }
    }

    public async forceLogin(): Promise<boolean> {
        try {
            this.logger.info('Forcing fresh Adobe login...');
            // Force logout first, then login with force flag
            await execAsync('aio auth logout --force');
            await execAsync('aio auth login -f');
            return await this.isAuthenticated();
        } catch (error) {
            this.logger.error('Adobe force login failed', error as Error);
            return false;
        }
    }

    public async logout(): Promise<void> {
        try {
            await execAsync('aio auth logout');
            this.logger.info('Adobe logout successful');
        } catch (error) {
            this.logger.warn('Adobe logout failed:', error);
        }
    }

    public async verifyAccess(): Promise<boolean> {
        try {
            // Try to list organizations as a verification step
            const { stdout } = await execAsync('aio console org list');
            return stdout.includes('Org ID') || stdout.includes('Org Name');
        } catch (error) {
            this.logger.warn('Failed to verify Adobe access');
            return false;
        }
    }

    public async getOrganizations(): Promise<AdobeOrg[]> {
        try {
            const { stdout } = await execAsync('aio console org list --json');
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
            await execAsync(`aio console org select ${orgCode}`);
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
            const { stdout } = await execAsync(`aio console project list --json ${orgFlag}`);
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
            await execAsync(`aio console project select ${projectId}`);
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
            const { stdout } = await execAsync(`aio console workspace list --json ${projectFlag}`);
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
            await execAsync(`aio console workspace select ${workspaceId}`);
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