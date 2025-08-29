import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Prerequisites } from '../types';
import { Logger } from './logger';

const execAsync = promisify(exec);

export class PrerequisitesChecker {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async check(): Promise<Prerequisites> {
        const result: Prerequisites = {
            fnm: { installed: false },
            node: { installed: false, versions: {} },
            adobeIO: { installed: false, authenticated: false },
            apiMesh: { installed: false }
        };

        // Check Node.js
        try {
            const { stdout } = await execAsync('node --version');
            result.node.installed = true;
            result.node.version = stdout.trim().replace('v', '');
            this.logger.info(`Node.js version: ${result.node.version}`);
        } catch {
            this.logger.warn('Node.js not found');
        }

        // Check fnm (Fast Node Manager)
        try {
            const { stdout } = await execAsync('fnm --version');
            result.fnm.installed = true;
            result.fnm.version = stdout.trim();
            this.logger.info(`fnm version: ${result.fnm.version}`);
            
            // Check all installed Node versions via fnm
            try {
                const { stdout: fnmList } = await execAsync('fnm list');
                // Parse fnm list output to extract versions
                // Example output: "* v22.18.0 default\n  v18.20.0\n  v24.0.1"
                const versionLines = fnmList.split('\n').filter(line => line.trim());
                const installedVersions: string[] = [];
                
                for (const line of versionLines) {
                    // Extract version number from each line
                    const versionMatch = line.match(/v?(\d+\.\d+\.\d+)/);
                    if (versionMatch) {
                        installedVersions.push(versionMatch[1]);
                    }
                }
                
                // Store all installed versions (will be passed to frontend)
                (result.node as any).installedVersions = installedVersions;
                this.logger.info(`fnm installed Node versions: ${installedVersions.join(', ')}`);
            } catch (error) {
                this.logger.warn('Could not query fnm for installed versions');
            }
        } catch {
            this.logger.warn('fnm not found');
        }

        // Check Adobe I/O CLI
        try {
            const { stdout } = await execAsync('aio --version');
            result.adobeIO.installed = true;
            result.adobeIO.version = stdout.trim();
            this.logger.info(`Adobe I/O CLI version: ${result.adobeIO.version}`);
            
            // Check authentication
            try {
                await execAsync('aio auth:list');
                result.adobeIO.authenticated = true;
            } catch {
                result.adobeIO.authenticated = false;
            }
        } catch {
            this.logger.warn('Adobe I/O CLI not found');
        }

        // Check API Mesh plugin
        try {
            await execAsync('aio api-mesh --version');
            result.apiMesh.installed = true;
            this.logger.info('API Mesh plugin installed');
        } catch {
            this.logger.warn('API Mesh plugin not found');
        }

        return result;
    }

    // Installation methods have been removed - use PrerequisitesManager instead
    // PrerequisitesManager reads installation commands from prerequisites.json
    // for better maintainability and consistency
}