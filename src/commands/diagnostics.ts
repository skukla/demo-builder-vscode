import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ServiceLocator } from '../services/serviceLocator';
import { parseJSON } from '../types/typeGuards';
import { getLogger, CommandResult } from '../shared/logging';

// Diagnostic Type Definitions
interface SystemInfo {
    platform: string;
    release: string;
    arch: string;
    cpus: number;
    memory: string;
    homedir: string;
    tmpdir: string;
    shell: string;
}

interface VSCodeInfo {
    version: string;
    appName: string;
    language: string;
    machineId: string;
    sessionId: string;
}

interface CommandCheckResult {
    installed: boolean;
    output?: string;
    error?: string;
    duration: number;
    code?: number;
    versions?: string[];
}

interface ToolsInfo {
    node: CommandCheckResult;
    npm: CommandCheckResult;
    fnm: CommandCheckResult;
    git: CommandCheckResult;
    aio: CommandCheckResult;
}

interface AdobeContextInfo {
    org: string;
    project: string;
    workspace: string;
}

interface AdobeCLIInfo {
    installed: boolean;
    version?: string;
    authConfigured?: boolean;
    hasToken?: boolean;
    hasRefreshToken?: boolean;
    expiresIn?: string;
    tokenExpired?: boolean;
    expiryDate?: string;
    authParseError?: string;
    currentContext?: AdobeContextInfo | string;
    canListOrgs?: boolean;
    organizationCount?: number;
}

interface EnvironmentInfo {
    PATH: string[];
    HOME: string | undefined;
    USER: string | undefined;
    SHELL: string | undefined;
    NODE_PATH: string | undefined;
    npm_config_prefix: string | undefined;
    FNM_DIR: string | undefined;
    FNM_MULTISHELL_PATH: string | undefined;
    FNM_NODE_DIST_MIRROR: string | undefined;
    FNM_LOGLEVEL: string | undefined;
}

interface BrowserLaunchTest {
    platform: string;
    command: string;
    available: boolean;
}

interface AdobeLoginTest {
    available: boolean;
    supportsForceFlag: boolean;
}

interface FileSystemTest {
    canWrite: boolean;
    canRead: boolean;
    tempDir: string;
    error?: string;
}

interface TestResults {
    browserLaunch: BrowserLaunchTest;
    adobeLoginCommand: AdobeLoginTest;
    fileSystem: FileSystemTest;
}

interface DiagnosticsReport {
    timestamp: string;
    system: SystemInfo;
    vscode: VSCodeInfo;
    tools: ToolsInfo;
    adobe: AdobeCLIInfo;
    environment: EnvironmentInfo;
    tests: TestResults;
}

export class DiagnosticsCommand {
    private logger = getLogger();

    public async execute(): Promise<void> {
        this.logger.info('Running Demo Builder diagnostics...');
        this.logger.showDebug(true);
        
        // Clear debug channel for fresh diagnostics
        this.logger.clearDebug();
        
        const report: DiagnosticsReport = {
            timestamp: new Date().toISOString(),
            system: {} as SystemInfo,
            vscode: {} as VSCodeInfo,
            tools: {} as ToolsInfo,
            adobe: {} as AdobeCLIInfo,
            environment: {} as EnvironmentInfo,
            tests: {} as TestResults,
        };

        try {
            // System information
            this.logger.debug('Collecting system information...');
            report.system = await this.getSystemInfo();
            
            // VS Code information
            this.logger.debug('Collecting VS Code information...');
            report.vscode = this.getVSCodeInfo();
            
            // Tool versions
            this.logger.debug('Checking tool versions...');
            report.tools = await this.checkTools();
            
            // Adobe CLI status
            this.logger.debug('Checking Adobe CLI...');
            report.adobe = await this.checkAdobeCLI();
            
            // Environment variables
            this.logger.debug('Collecting environment variables...');
            report.environment = this.getEnvironment();
            
            // Run diagnostic tests
            this.logger.debug('Running diagnostic tests...');
            report.tests = await this.runTests();
            
            // Log the full report
            this.logger.debug('DIAGNOSTIC REPORT', report);
            
            // Show summary in main output
            this.showSummary(report);
            
            // Offer to export
            const action = await vscode.window.showInformationMessage(
                'Diagnostics complete. Check the Debug output for details.',
                'Show Debug Output',
                'Export Log',
            );
            
            if (action === 'Show Debug Output') {
                this.logger.showDebug(false);
            } else if (action === 'Export Log') {
                await this.logger.exportDebugLog();
            }
            
        } catch (error) {
            this.logger.error('Diagnostics failed', error as Error);
            throw error;
        }
    }

    private async getSystemInfo(): Promise<SystemInfo> {
        return {
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            cpus: os.cpus().length,
            memory: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`,
            homedir: os.homedir(),
            tmpdir: os.tmpdir(),
            shell: process.env.SHELL || 'unknown',
        };
    }

    private getVSCodeInfo(): VSCodeInfo {
        return {
            version: vscode.version,
            appName: vscode.env.appName,
            language: vscode.env.language,
            machineId: vscode.env.machineId.substring(0, 8) + '...',
            sessionId: vscode.env.sessionId.substring(0, 8) + '...',
        };
    }

    private async checkTools(): Promise<ToolsInfo> {
        const node = await this.checkCommand('node --version');
        const npm = await this.checkCommand('npm --version');
        const fnm = await this.checkCommand('fnm --version');

        if (fnm.installed) {
            // List fnm installations
            const fnmList = await this.checkCommand('fnm list');
            if (fnmList.installed && fnmList.output) {
                fnm.versions = fnmList.output.split('\n').filter((l: string) => l.trim());
            }
        }

        const git = await this.checkCommand('git --version');
        const aio = await this.checkCommand('aio --version');

        return {
            node,
            npm,
            fnm,
            git,
            aio,
        };
    }

    private async checkAdobeCLI(): Promise<AdobeCLIInfo> {
        const adobe: AdobeCLIInfo = {
            installed: false,
        };

        // Check if Adobe CLI is installed
        const aioVersion = await this.checkCommand('aio --version');
        adobe.installed = aioVersion.installed;
        adobe.version = aioVersion.output;

        if (adobe.installed) {
            // Check authentication status
            const authCheck = await this.checkCommand('aio config get ims.contexts.aio-cli-plugin-auth');
            adobe.authConfigured = authCheck.installed && !!authCheck.output && authCheck.output.length > 0;

            if (adobe.authConfigured && authCheck.output) {
                // Try to parse the auth config
                try {
                    const authData = parseJSON<{ access_token?: string; refresh_token?: string; expires_in?: string }>(authCheck.output);
                    if (!authData) {
                        throw new Error('Invalid auth data format');
                    }
                    adobe.hasToken = !!authData.access_token;
                    adobe.hasRefreshToken = !!authData.refresh_token;
                    adobe.expiresIn = authData.expires_in;

                    // Check if token is expired
                    if (adobe.expiresIn) {
                        const expiryTime = parseInt(adobe.expiresIn);
                        const now = Date.now();
                        adobe.tokenExpired = expiryTime < now;
                        adobe.expiryDate = new Date(expiryTime).toISOString();
                    }
                } catch (e) {
                    adobe.authParseError = (e as Error).message;
                    this.logger.debug('Failed to parse auth config', authCheck.output);
                }
            }

            // Check current context using 'aio console where'
            const whereCheck = await this.checkCommand('aio console where --json');
            if (whereCheck.installed && whereCheck.output) {
                try {
                    const context = parseJSON<{ org?: { name?: string }; project?: { name?: string }; workspace?: { name?: string } }>(whereCheck.output);
                    if (!context) {
                        throw new Error('Invalid context format');
                    }
                    adobe.currentContext = {
                        org: context.org?.name || 'Not selected',
                        project: context.project?.name || 'Not selected',
                        workspace: context.workspace?.name || 'Not selected',
                    };
                } catch {
                    adobe.currentContext = whereCheck.output;
                }
            }

            // Try to list organizations
            const orgCheck = await this.checkCommand('aio console org list --json');
            adobe.canListOrgs = orgCheck.installed && orgCheck.output !== undefined && !orgCheck.output.includes('Error');
            if (adobe.canListOrgs && orgCheck.output) {
                try {
                    const orgs = parseJSON<{ id?: string; name?: string }[]>(orgCheck.output);
                    if (!orgs) {
                        throw new Error('Invalid orgs format');
                    }
                    adobe.organizationCount = Array.isArray(orgs) ? orgs.length : 0;
                } catch {
                    // Fallback to raw output
                }
            }
        }

        return adobe;
    }

    private getEnvironment(): EnvironmentInfo {
        const env = process.env;
        return {
            PATH: env.PATH?.split(path.delimiter) || [],
            HOME: env.HOME,
            USER: env.USER,
            SHELL: env.SHELL,
            NODE_PATH: env.NODE_PATH,
            npm_config_prefix: env.npm_config_prefix,
            FNM_DIR: env.FNM_DIR,
            FNM_MULTISHELL_PATH: env.FNM_MULTISHELL_PATH,
            FNM_NODE_DIST_MIRROR: env.FNM_NODE_DIST_MIRROR,
            FNM_LOGLEVEL: env.FNM_LOGLEVEL,
        };
    }

    private async runTests(): Promise<TestResults> {
        // Test browser launch capability
        this.logger.debug('Testing browser launch...');
        const browserLaunch = await this.testBrowserLaunch();

        // Test Adobe login command
        this.logger.debug('Testing Adobe login command...');
        const adobeLoginCommand = await this.testAdobeLogin();

        // Test file system access
        this.logger.debug('Testing file system access...');
        const fileSystem = await this.testFileSystem();

        return {
            browserLaunch,
            adobeLoginCommand,
            fileSystem,
        };
    }

    private async checkCommand(command: string): Promise<CommandCheckResult> {
        const startTime = Date.now();
        const commandManager = ServiceLocator.getCommandExecutor();
        try {
            // Use appropriate options based on command type
            let execResult;
            if (command.includes('node') || command.includes('npm')) {
                execResult = await commandManager.execute(command, {
                    useNodeVersion: 'current',
                });
            } else if (command.includes('aio')) {
                execResult = await commandManager.execute(command, {
                    enhancePath: true,
                    configureTelemetry: true,
                    useNodeVersion: 'auto',
                });
            } else {
                execResult = await commandManager.execute(command);
            }
            const { stdout, stderr } = execResult;
            const duration = Date.now() - startTime;

            const result: CommandResult = {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                code: 0,
                duration,
                cwd: process.cwd(),
            };

            this.logger.logCommand(command, result);

            return {
                installed: true,
                output: stdout.trim(),
                error: stderr.trim(),
                duration,
            };
        } catch (error: unknown) {
            const duration = Date.now() - startTime;
            const err = error as { stdout?: string; stderr?: string; message: string; code?: number };

            const result: CommandResult = {
                stdout: err.stdout || '',
                stderr: err.stderr || err.message,
                code: err.code || -1,
                duration,
                cwd: process.cwd(),
            };

            this.logger.logCommand(command, result);

            return {
                installed: false,
                error: err.message,
                code: err.code,
                duration,
            };
        }
    }

    private async testBrowserLaunch(): Promise<BrowserLaunchTest> {
        // Test if we can open a URL (won't actually open, just test the command)
        const platform = os.platform();
        let command: string;

        switch (platform) {
            case 'darwin':
                command = 'open --help';
                break;
            case 'win32':
                command = 'start /?';
                break;
            default:
                command = 'xdg-open --help';
        }

        const result = await this.checkCommand(command);
        return {
            platform,
            command: command.split(' ')[0],
            available: result.installed,
        };
    }

    private async testAdobeLogin(): Promise<AdobeLoginTest> {
        // Test if Adobe login command is available (without actually running it)
        const result = await this.checkCommand('aio auth login --help');
        return {
            available: result.installed,
            supportsForceFlag: result.installed && !!result.output && result.output.includes('-f'),
        };
    }

    private async testFileSystem(): Promise<FileSystemTest> {
        const tempDir = os.tmpdir();
        const testFile = path.join(tempDir, 'demo-builder-test.txt');

        try {

            // Test write
            await fs.writeFile(testFile, 'test');

            // Test read
            const content = await fs.readFile(testFile, 'utf8');

            // Clean up
            await fs.unlink(testFile);

            return {
                canWrite: true,
                canRead: content === 'test',
                tempDir,
            };
        } catch (error) {
            return {
                canWrite: false,
                canRead: false,
                error: (error as Error).message,
                tempDir,
            };
        }
    }

    private showSummary(report: DiagnosticsReport): void {
        this.logger.info('=== DIAGNOSTICS SUMMARY ===');
        this.logger.info(`System: ${report.system.platform} ${report.system.release}`);
        this.logger.info(`VS Code: ${report.vscode.version}`);

        // Tools summary
        this.logger.info('');
        this.logger.info('Tools Status:');
        Object.entries(report.tools).forEach(([tool, info]) => {
            const status = info.installed ? '✅' : '❌';
            const version = info.installed ? info.output : 'Not installed';
            this.logger.info(`  ${status} ${tool}: ${version}`);
        });

        // Adobe CLI summary
        if (report.adobe.installed) {
            this.logger.info('');
            this.logger.info('Adobe CLI Status:');
            this.logger.info(`  Version: ${report.adobe.version}`);
            this.logger.info(`  Authenticated: ${report.adobe.authConfigured ? 'Yes' : 'No'}`);
            if (report.adobe.authConfigured) {
                this.logger.info(`  Token Valid: ${!report.adobe.tokenExpired ? 'Yes' : 'No'}`);
                this.logger.info(`  Can List Orgs: ${report.adobe.canListOrgs ? 'Yes' : 'No'}`);
            }
        }

        // Test results
        this.logger.info('');
        this.logger.info('Diagnostic Tests:');
        this.logger.info(`  Browser Launch: ${report.tests.browserLaunch.available ? 'Available' : 'Not available'}`);
        this.logger.info(`  Adobe Login Command: ${report.tests.adobeLoginCommand.available ? 'Available' : 'Not available'}`);
        this.logger.info(`  File System Access: ${report.tests.fileSystem.canWrite ? 'OK' : 'Failed'}`);

        this.logger.info('');
        this.logger.info('Full details available in Demo Builder - Debug output channel');
    }
}