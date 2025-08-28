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
            result.node.version = stdout.trim();
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

    public async installFnm(): Promise<boolean> {
        const terminal = vscode.window.createTerminal('Install fnm');
        terminal.show();
        
        // Install fnm using curl
        const installCommand = 'curl -fsSL https://fnm.vercel.app/install | bash';
        terminal.sendText(installCommand);
        
        // Wait for user confirmation
        const result = await vscode.window.showInformationMessage(
            'fnm installation started. Complete the installation in the terminal, then click Continue.',
            { modal: true },
            'Continue'
        );
        
        return result === 'Continue';
    }

    public async installAdobeIO(): Promise<boolean> {
        const terminal = vscode.window.createTerminal('Install Adobe I/O CLI');
        terminal.show();
        
        // Install Adobe I/O CLI globally
        terminal.sendText('npm install -g @adobe/aio-cli');
        
        // Wait for completion
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Install API Mesh plugin
        terminal.sendText('aio plugins:install @adobe/aio-cli-plugin-api-mesh');
        
        // Wait for user confirmation
        const result = await vscode.window.showInformationMessage(
            'Adobe I/O CLI installation started. Complete the installation in the terminal, then click Continue.',
            { modal: true },
            'Continue'
        );
        
        return result === 'Continue';
    }

    public async installNode(version: string): Promise<boolean> {
        const terminal = vscode.window.createTerminal('Install Node.js');
        terminal.show();
        
        // Use fnm to install Node.js
        terminal.sendText(`fnm install ${version}`);
        terminal.sendText(`fnm use ${version}`);
        
        // Wait for user confirmation
        const result = await vscode.window.showInformationMessage(
            `Node.js ${version} installation started. Complete the installation in the terminal, then click Continue.`,
            { modal: true },
            'Continue'
        );
        
        return result === 'Continue';
    }
}