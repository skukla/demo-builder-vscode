import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ServiceLocator } from '../services/serviceLocator';
import { Project, ProjectTemplate, CommerceConfig } from '../types';
import { AuthenticationService, AdobeOrg, AdobeProject } from '../utils/auth';
import { FrontendInstaller } from '../utils/frontendInstaller';
import { MeshDeployer } from '../utils/meshDeployer';
import { PrerequisitesManager } from '../utils/prerequisitesManager';
import { BaseCommand } from '@/shared/base';

// Adobe configuration interface
interface AdobeConfiguration {
    projectId: string;
    projectName: string;
    organization: string;
    orgId: string;
    orgCode: string;
    workspace: string;
    authenticated: boolean;
}

// Quick pick item with value
interface QuickPickItemWithValue<T> extends vscode.QuickPickItem {
    value: T;
}

export class CreateProjectCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            this.logger.info('[Project Creation] Starting CLI-based creation...');
            
            // Check if project already exists
            if (await this.stateManager.hasProject()) {
                const overwrite = await this.confirm(
                    'A project already exists in this workspace.',
                    'Creating a new project will overwrite the existing configuration. Continue?',
                );
                
                if (!overwrite) {
                    return;
                }
                
                // Stop any running processes
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
            }

            // Step 1: Check prerequisites
            const prereqsOk = await this.checkPrerequisites();
            if (!prereqsOk) {
                return;
            }

            // Step 2: Get project configuration
            const projectConfig = await this.getProjectConfiguration();
            if (!projectConfig) {
                return;
            }

            // Step 3: Adobe authentication
            const adobeConfig = await this.configureAdobe();
            if (!adobeConfig) {
                return;
            }

            // Step 4: Commerce configuration
            const commerceConfig = await this.configureCommerce(projectConfig.template);
            if (!commerceConfig) {
                return;
            }

            // Step 5: Create project
            await this.createProject(projectConfig, adobeConfig, commerceConfig);

            this.logger.info('Project creation completed successfully!');
            await vscode.window.showInformationMessage(
                `Project "${projectConfig.name}" created successfully!`,
                'Start Demo',
            ).then(selection => {
                if (selection === 'Start Demo') {
                    vscode.commands.executeCommand('demoBuilder.startDemo');
                }
            });

        } catch (error) {
            await this.showError('Failed to create project', error as Error);
        }
    }

    private async checkPrerequisites(): Promise<boolean> {
        return this.withProgress('Checking prerequisites...', async (progress) => {
            const prereqManager = new PrerequisitesManager(this.context.extensionPath, this.logger);
            
            progress.report({ message: 'Checking prerequisites...' });
            await prereqManager.loadConfig();
            const prerequisites = await prereqManager.getRequiredPrerequisites();
            const statuses = await prereqManager.checkAllPrerequisites(prerequisites);
            
            const nodeStatus = statuses.find(s => s.id === 'node');
            if (!nodeStatus?.installed) {
                const install = await vscode.window.showErrorMessage(
                    'Node.js is not installed. Demo Builder requires Node.js to function.',
                    'Install Guide',
                    'Cancel',
                );
                
                if (install === 'Install Guide') {
                    vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org'));
                }
                return false;
            }

            progress.report({ message: 'Checking Adobe I/O CLI...' });
            const adobeStatus = statuses.find(s => s.id === 'aio-cli');
            if (!adobeStatus?.installed) {
                const install = await vscode.window.showWarningMessage(
                    'Adobe I/O CLI is not installed. It\'s required for mesh deployment.',
                    'Use Webview Wizard',
                    'Continue Anyway',
                );
                
                if (install === 'Use Webview Wizard') {
                    // The webview wizard handles prerequisite installation
                    await vscode.commands.executeCommand('demoBuilder.createProjectWebview');
                    return false; // Exit this flow as user will use webview
                }
            }

            progress.report({ message: 'Prerequisites check complete' });
            return true;
        });
    }

    private async getProjectConfiguration(): Promise<{ name: string; template: ProjectTemplate } | undefined> {
        // Project name
        const name = await this.showInputBox({
            prompt: 'Project name',
            placeHolder: 'my-commerce-demo',
            validateInput: (value) => {
                if (!value) return 'Project name is required';
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Use lowercase letters, numbers, and hyphens only';
                }
                if (value.length < 3) return 'Name must be at least 3 characters';
                if (value.length > 30) return 'Name must be less than 30 characters';
                return undefined;
            },
        });

        if (!name) {
            return undefined;
        }

        // Project template
        const templates = [
            {
                label: '$(cloud) Adobe Commerce (Platform-as-a-Service)',
                description: 'Full Commerce instance with all services',
                value: 'commerce-paas' as ProjectTemplate,
            },
            {
                label: '$(package) Adobe Commerce (Software-as-a-Service)',
                description: 'Simplified SaaS endpoint (Coming Soon)',
                value: 'commerce-saas' as ProjectTemplate,
                disabled: true,
            },
            {
                label: '$(layers) AEM + Commerce',
                description: 'Hybrid content and commerce (Coming Soon)',
                value: 'aem-commerce' as ProjectTemplate,
                disabled: true,
            },
        ];

        const selectedTemplate = await this.showQuickPick(
            templates.filter(t => !t.disabled),
            {
                placeHolder: 'Select Commerce backend type',
            },
        );

        if (!selectedTemplate) {
            return undefined;
        }

        return {
            name,
            template: selectedTemplate.value,
        };
    }

    private async configureAdobe(): Promise<AdobeConfiguration | undefined> {
        return this.withProgress('Configuring Adobe services...', async (progress) => {
            const authManager = new AuthenticationService(
                this.context.extensionPath,
                this.logger,
                ServiceLocator.getCommandExecutor(),
            );
            
            progress.report({ message: 'Checking authentication...' });
            const isAuthenticated = await authManager.isAuthenticated();
            
            if (!isAuthenticated) {
                progress.report({ message: 'Authentication required...' });
                
                const auth = await vscode.window.showWarningMessage(
                    'Adobe authentication required for API Mesh deployment',
                    'Login Now',
                    'Cancel',
                );
                
                if (auth !== 'Login Now') {
                    return undefined;
                }

                // Open terminal for auth
                const terminal = this.createTerminal('Adobe Auth');
                
                // First try normal login
                terminal.sendText('echo "Attempting Adobe login..."');
                terminal.sendText('aio auth login');
                terminal.show();
                
                // Wait for user to complete auth
                const result = await vscode.window.showInformationMessage(
                    'Complete the authentication in the terminal, then click Continue',
                    { modal: true },
                    'Continue',
                    'Retry with Force',
                );
                
                if (!result) {
                    return undefined;
                }
                
                // If user selected retry with force
                if (result === 'Retry with Force') {
                    terminal.sendText('echo "Forcing fresh login..."');
                    terminal.sendText('aio auth logout --force');
                    terminal.sendText('aio auth login -f');
                    
                    await vscode.window.showInformationMessage(
                        'Complete the forced authentication in the terminal, then click Continue',
                        { modal: true },
                        'Continue',
                    );
                }
                
                // Verify auth succeeded
                terminal.sendText('echo "Verifying authentication..."');
                terminal.sendText('aio console org list');
                
                if (!await authManager.isAuthenticated()) {
                    const retry = await vscode.window.showErrorMessage(
                        'Adobe authentication verification failed',
                        'Force Login',
                        'Cancel',
                    );
                    
                    if (retry === 'Force Login') {
                        // Try force login through auth manager
                        progress.report({ message: 'Attempting forced login...' });
                        // Force login not available in simplified API, try regular login again
                        await authManager.logout();
                        const loginSuccess = await authManager.login(true);
                        if (!loginSuccess) {
                            await this.showError('Adobe authentication failed even with force login');
                            return undefined;
                        }
                    } else {
                        return undefined;
                    }
                }
            }

            // Verify Adobe access is working
            progress.report({ message: 'Verifying Adobe access...' });
            const hasAccess = await authManager.isAuthenticated();
            if (!hasAccess) {
                await this.showError('Adobe authentication succeeded but cannot access Adobe Console');
                return undefined;
            }
            
            progress.report({ message: 'Getting Adobe organizations...' });
            
            // Step 1: Get and select organization
            const orgs = await authManager.getOrganizations();
            let selectedOrg: AdobeOrg;

            if (orgs.length === 0) {
                const openConsole = await vscode.window.showErrorMessage(
                    'No Adobe organizations found. You may need to request access.',
                    'Open Adobe Console',
                    'Cancel',
                );
                if (openConsole === 'Open Adobe Console') {
                    vscode.env.openExternal(vscode.Uri.parse('https://console.adobe.io'));
                }
                return undefined;
            } else if (orgs.length === 1) {
                // Auto-select single org
                selectedOrg = orgs[0];
                await authManager.selectOrganization(selectedOrg.id);
                this.logger.info(`Auto-selected organization: ${selectedOrg.name}`);
            } else {
                // Let user choose org
                const orgChoice = await this.showQuickPick<QuickPickItemWithValue<AdobeOrg>>(
                    orgs.map((org) => ({
                        label: org.name,
                        description: `Code: ${org.code}`,
                        detail: `ID: ${org.id}`,
                        value: org,
                    })),
                    {
                        placeHolder: 'Select your Adobe organization',
                    },
                );

                if (!orgChoice) {
                    return undefined;
                }

                selectedOrg = orgChoice.value;
                await authManager.selectOrganization(selectedOrg.id);
            }
            
            progress.report({ message: `Getting projects for ${selectedOrg.name}...` });
            
            // Step 2: Get and select project
            const projects = await authManager.getProjects();
            let selectedProject: AdobeProject;

            if (projects.length === 0) {
                const choices = await vscode.window.showWarningMessage(
                    `No projects found in ${selectedOrg.name}. You need to create a project first.`,
                    'Open Adobe Console',
                    'Import console.json',
                    'Cancel',
                );
                
                if (choices === 'Open Adobe Console') {
                    vscode.env.openExternal(vscode.Uri.parse('https://console.adobe.io'));
                    return undefined;
                } else if (choices === 'Import console.json') {
                    // Import from console.json is not supported in simplified API
                    vscode.window.showWarningMessage('Import from console.json is not currently supported');
                    return undefined;
                }
                return undefined;
            } else {
                // Show searchable project list
                const projectChoice = await this.showQuickPick<QuickPickItemWithValue<AdobeProject | 'import'>>(
                    [
                        ...projects.map((proj) => ({
                            label: proj.title || proj.name,
                            description: proj.description || `Name: ${proj.name}`,
                            detail: `ID: ${proj.id}`,
                            value: proj as AdobeProject | 'import',
                        })),
                        {
                            label: '$(file) Import console.json instead',
                            description: 'Use a downloaded console.json file',
                            value: 'import' as AdobeProject | 'import',
                        },
                    ],
                    {
                        placeHolder: 'Select your Adobe project (type to search)',
                        matchOnDescription: true,
                        matchOnDetail: true,
                    },
                );

                if (!projectChoice) {
                    return undefined;
                }

                if (projectChoice.value === 'import') {
                    // Import from console.json is not supported in simplified API
                    vscode.window.showWarningMessage('Import from console.json is not currently supported');
                    return undefined;
                }

                selectedProject = projectChoice.value;
                await authManager.selectProject(selectedProject.id);
            }
            
            // For MVP, default to Stage workspace
            // In future, could add workspace selection here
            
            return {
                projectId: selectedProject.id,
                projectName: selectedProject.title || selectedProject.name,
                organization: selectedOrg.name,
                orgId: selectedOrg.id,
                orgCode: selectedOrg.code,
                workspace: 'Stage',
                authenticated: true,
            };
        });
    }

    private async configureCommerce(_template: ProjectTemplate): Promise<CommerceConfig | undefined> {
        const commerceUrl = await this.showInputBox({
            prompt: 'Commerce Instance URL',
            placeHolder: 'https://my-store.adobe.com',
            validateInput: (value) => {
                if (!value) return 'URL is required';
                try {
                    new URL(value);
                    return undefined;
                } catch {
                    return 'Invalid URL format';
                }
            },
        });

        if (!commerceUrl) {
            return undefined;
        }

        const environmentId = await this.showInputBox({
            prompt: 'Environment ID',
            placeHolder: 'my-environment-id',
            ignoreFocusOut: true,
        });

        if (!environmentId) {
            return undefined;
        }

        const storeCode = await this.showInputBox({
            prompt: 'Store Code',
            placeHolder: 'main_website_store',
            value: 'main_website_store',
        });

        if (!storeCode) {
            return undefined;
        }

        const storeView = await this.showInputBox({
            prompt: 'Store View Code',
            placeHolder: 'default',
            value: 'default',
        });

        if (!storeView) {
            return undefined;
        }

        // API Keys
        const catalogApiKey = await this.showInputBox({
            prompt: 'Catalog Service API Key (optional)',
            placeHolder: 'Enter API key or leave blank',
            password: true,
            ignoreFocusOut: true,
        });

        const searchApiKey = await this.showInputBox({
            prompt: 'Live Search API Key (optional)',
            placeHolder: 'Enter API key or leave blank',
            password: true,
            ignoreFocusOut: true,
        });

        return {
            type: 'platform-as-a-service',
            instance: {
                url: commerceUrl,
                environmentId,
                storeView,
                websiteCode: 'base',
                storeCode,
            },
            services: {
                catalog: catalogApiKey ? {
                    enabled: true,
                    endpoint: 'https://catalog.adobe.io',
                    apiKey: catalogApiKey,
                } : undefined,
                liveSearch: searchApiKey ? {
                    enabled: true,
                    endpoint: 'https://search.adobe.io',
                    apiKey: searchApiKey,
                } : undefined,
            },
        };
    }

    private async createProject(
        projectConfig: { name: string; template: ProjectTemplate },
        adobeConfig: AdobeConfiguration,
        commerceConfig: CommerceConfig,
    ): Promise<void> {
        return this.withProgress('Creating project...', async (progress) => {
            const projectPath = path.join(os.homedir(), '.demo-builder', 'projects', projectConfig.name);
            
            // Create project structure
            progress.report({ message: 'Creating project structure...' });
            
            const project: Project = {
                name: projectConfig.name,
                template: projectConfig.template,
                created: new Date(),
                lastModified: new Date(),
                path: projectPath,
                status: 'created',
                adobe: adobeConfig,
                commerce: commerceConfig,
            };

            // Save project
            await this.stateManager.saveProject(project);

            // Deploy mesh
            progress.report({ message: 'Deploying API Mesh...' });
            const meshDeployer = new MeshDeployer(this.logger);
            const meshResult = await meshDeployer.deploy(project);
            
            if (meshResult.success && meshResult.endpoint) {
                // Update mesh component instance with endpoint
                const meshComponent = project.componentInstances?.['commerce-mesh'];
                if (meshComponent) {
                    meshComponent.endpoint = meshResult.endpoint;
                    meshComponent.status = 'deployed';
                    meshComponent.lastUpdated = new Date();
                    await this.stateManager.saveProject(project);
                }
            }

            // Install frontend
            progress.report({ message: 'Installing frontend application...' });
            const frontendInstaller = new FrontendInstaller(this.logger);
            await frontendInstaller.install(project);

            // Update status
            project.status = 'ready';
            await this.stateManager.saveProject(project);
            
            // Update status bar
            this.statusBar.updateProject(project);
            
            progress.report({ message: 'Project created successfully!' });
        });
    }
}