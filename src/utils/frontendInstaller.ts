import * as fs from 'fs/promises';
import * as path from 'path';
import { Project } from '../types';
import { Logger } from './logger';
import { getExternalCommandManager } from '../extension';
import { ExternalCommandManager } from './externalCommandManager';

export class FrontendInstaller {
    private logger: Logger;
    private readonly FRONTEND_REPO = 'https://github.com/adobe/citisignal-nextjs.git';

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async install(project: Project): Promise<void> {
        try {
            const frontendPath = project.frontend?.path;
            if (!frontendPath) {
                throw new Error('Frontend path not defined');
            }

            // Clone repository
            this.logger.info('Cloning frontend repository...');
            const commandManager = getExternalCommandManager();
            await commandManager.execute(`git clone ${this.FRONTEND_REPO} "${frontendPath}"`);
            
            // Copy environment file
            const projectEnv = path.join(project.path, '.env');
            const frontendEnv = path.join(frontendPath, '.env');
            await fs.copyFile(projectEnv, frontendEnv);
            
            // Install dependencies (optional, user can do this later)
            // For MVP, we'll skip auto-install to save time
            this.logger.info('Frontend cloned successfully');
            
        } catch (error) {
            this.logger.error('Frontend installation failed', error as Error);
            throw error;
        }
    }

    public async update(project: Project, version?: string): Promise<void> {
        try {
            const frontendPath = project.frontend?.path;
            if (!frontendPath) {
                throw new Error('Frontend path not defined');
            }

            // Pull latest changes
            if (version) {
                const commandManager = getExternalCommandManager();
                await commandManager.execute(`git checkout ${version}`, { cwd: frontendPath });
            } else {
                const commandManager = getExternalCommandManager();
                await commandManager.execute('git pull', { cwd: frontendPath });
            }
            
            this.logger.info('Frontend updated successfully');
        } catch (error) {
            this.logger.error('Frontend update failed', error as Error);
            throw error;
        }
    }

    public async installDependencies(project: Project): Promise<void> {
        try {
            const frontendPath = project.frontend?.path;
            if (!frontendPath) {
                throw new Error('Frontend path not defined');
            }

            this.logger.info('Installing frontend dependencies...');
            const commandManager = getExternalCommandManager();
            await commandManager.execute('npm install', { 
                cwd: frontendPath,
                env: { ...process.env, NODE_ENV: 'development' }
            });
            
            this.logger.info('Dependencies installed successfully');
        } catch (error) {
            this.logger.error('Dependency installation failed', error as Error);
            throw error;
        }
    }

    public async enableInspector(project: Project): Promise<void> {
        try {
            const frontendPath = project.frontend?.path;
            if (!frontendPath) {
                throw new Error('Frontend path not defined');
            }

            // Install demo inspector package
            this.logger.info('Installing Demo Inspector...');
            const commandManager = getExternalCommandManager();
            await commandManager.execute('npm install @adobe/demo-inspector', { 
                cwd: frontendPath 
            });
            
            // Update environment variable
            const envPath = path.join(frontendPath, '.env');
            let envContent = await fs.readFile(envPath, 'utf-8');
            
            if (envContent.includes('DEMO_INSPECTOR_ENABLED')) {
                envContent = envContent.replace(
                    /DEMO_INSPECTOR_ENABLED=.*/,
                    'DEMO_INSPECTOR_ENABLED=true'
                );
            } else {
                envContent += '\nDEMO_INSPECTOR_ENABLED=true\n';
            }
            
            await fs.writeFile(envPath, envContent);
            this.logger.info('Demo Inspector enabled');
            
        } catch (error) {
            this.logger.error('Failed to enable Demo Inspector', error as Error);
            throw error;
        }
    }
}