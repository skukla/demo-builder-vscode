/**
 * Diagnostics collection — environment, tools, Adobe CLI, and capability tests.
 *
 * Free functions rather than methods: none of them needs the command's state,
 * only a logger and the shared `checkCommand`. Splitting them out leaves the
 * command as orchestration — collect, render, offer actions — and makes each
 * check callable from a test without standing up the command shell.
 *
 * @module commands/diagnosticsChecks
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    browserProbeCommand,
    type AdobeCLIInfo,
    type AdobeLoginTest,
    type BrowserLaunchTest,
    type CommandCheckResult,
    type EnvironmentInfo,
    type FileSystemTest,
    type SystemInfo,
    type TestResults,
    type ToolsInfo,
    type VSCodeInfo,
} from './diagnosticsReport';
import { ServiceLocator } from '@/core/di';
import { getLogger, type CommandResultWithContext } from '@/core/logging';
import { parseJSON } from '@/types/typeGuards';

export async function getSystemInfo(): Promise<SystemInfo> {
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

export function getVSCodeInfo(): VSCodeInfo {
    return {
        version: vscode.version,
        appName: vscode.env.appName,
        language: vscode.env.language,
        machineId: vscode.env.machineId.substring(0, 8) + '...',
        sessionId: vscode.env.sessionId.substring(0, 8) + '...',
    };
}

export async function checkTools(): Promise<ToolsInfo> {
    const node = await checkCommand('node --version');
    const npm = await checkCommand('npm --version');
    const fnm = await checkCommand('fnm --version');

    if (fnm.installed) {
        // List fnm installations
        const fnmList = await checkCommand('fnm list');
        if (fnmList.installed && fnmList.output) {
            fnm.versions = fnmList.output.split('\n').filter((l: string) => l.trim());
        }
    }

    const git = await checkCommand('git --version');
    const aio = await checkCommand('aio --version');

    return {
        node,
        npm,
        fnm,
        git,
        aio,
    };
}

export async function checkAdobeCLI(): Promise<AdobeCLIInfo> {
    const adobe: AdobeCLIInfo = {
        installed: false,
    };

    // Check if Adobe CLI is installed
    const aioVersion = await checkCommand('aio --version');
    adobe.installed = aioVersion.installed;
    adobe.version = aioVersion.output;

    if (adobe.installed) {
        await checkAuthenticationStatus(adobe);
        await checkCurrentContext(adobe);
        await checkOrganizations(adobe);
    }

    return adobe;
}

/**
 * IMS contexts that may hold the CLI's credentials, newest layout first.
 *
 * aio 11.x stores auth under `cli`; `aio-cli-plugin-auth` is the older location
 * and stays in the list so an unmigrated install still reports correctly.
 */
const AUTH_CONTEXT_PATHS = ['ims.contexts.cli', 'ims.contexts.aio-cli-plugin-auth'] as const;

/**
 * Determine whether the Adobe CLI holds credentials.
 *
 * LIVE 2026-08-07: this reported `Authenticated: No` for a user whose token was
 * valid for another day and whose `aio console org list` returned their org. It
 * read only `aio-cli-plugin-auth`, which aio 11.x leaves empty — the token was
 * under `cli`. A diagnostic asserting the opposite of the truth is worse than a
 * silent one; it sent a verification run chasing a sign-in that had happened.
 *
 * @param adobe - the report section to populate
 */
export async function checkAuthenticationStatus(adobe: AdobeCLIInfo): Promise<void> {
    for (const contextPath of AUTH_CONTEXT_PATHS) {
        const authCheck = await checkCommand(`aio config get ${contextPath}`);
        if (authCheck.installed && authCheck.output && authCheck.output.length > 0) {
            adobe.authConfigured = true;
            parseAuthConfig(adobe, authCheck.output);
            return;
        }
    }
    adobe.authConfigured = false;
}

export function parseAuthConfig(adobe: AdobeCLIInfo, output: string): void {
    try {
        const authData = parseJSON<{
            access_token?: string;
            refresh_token?: string;
            expires_in?: string;
        }>(output);
        if (!authData) {
            throw new Error('Invalid auth data format');
        }
        adobe.hasToken = !!authData.access_token;
        adobe.hasRefreshToken = !!authData.refresh_token;
        adobe.expiresIn = authData.expires_in;

        if (adobe.expiresIn) {
            const expiryTime = parseInt(adobe.expiresIn);
            const now = Date.now();
            adobe.tokenExpired = expiryTime < now;
            adobe.expiryDate = new Date(expiryTime).toISOString();
        }
    } catch (e) {
        adobe.authParseError = (e as Error).message;
        getLogger().debug('Failed to parse auth config', output);
    }
}

export async function checkCurrentContext(adobe: AdobeCLIInfo): Promise<void> {
    const whereCheck = await checkCommand('aio console where --json');
    if (whereCheck.installed && whereCheck.output) {
        try {
            const context = parseJSON<{
                org?: { name?: string };
                project?: { name?: string };
                workspace?: { name?: string };
            }>(whereCheck.output);
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
}

export async function checkOrganizations(adobe: AdobeCLIInfo): Promise<void> {
    const orgCheck = await checkCommand('aio console org list --json');
    adobe.canListOrgs =
        orgCheck.installed &&
        orgCheck.output !== undefined &&
        !orgCheck.output.includes('Error');

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

export function getEnvironment(): EnvironmentInfo {
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

export async function runTests(): Promise<TestResults> {
    // Test browser launch capability
    getLogger().debug('Testing browser launch...');
    const browserLaunch = await testBrowserLaunch();

    // Test Adobe login command
    getLogger().debug('Testing Adobe login command...');
    const adobeLoginCommand = await testAdobeLogin();

    // Test file system access
    getLogger().debug('Testing file system access...');
    const fileSystem = await testFileSystem();

    return {
        browserLaunch,
        adobeLoginCommand,
        fileSystem,
    };
}

export async function checkCommand(command: string): Promise<CommandCheckResult> {
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
            // Other tools (git, fnm): run through a shell so the multi-word
            // "<tool> --version" string is parsed and executed. With execa's
            // default shell:false the whole string is treated as a single
            // binary name → the command never runs and stdout comes back
            // empty (the "✅ git: <blank>" symptom). enhancePath surfaces
            // tools installed outside the GUI launchd PATH.
            execResult = await commandManager.execute(command, {
                shell: true,
                enhancePath: true,
            });
        }
        const { stdout, stderr, code } = execResult;
        const duration = Date.now() - startTime;
        const trimmedStdout = stdout.trim();

        const result: CommandResultWithContext = {
            stdout: trimmedStdout,
            stderr: stderr.trim(),
            code: code ?? 0,
            duration,
            cwd: process.cwd(),
        };

        getLogger().logCommand(command, result);

        // The command ran without throwing, but a non-zero exit means the
        // tool isn't actually usable — e.g. a shell "command not found" (127)
        // resolves rather than throws. Treat only a clean exit as installed so
        // a failed probe reports "❌ Not installed" instead of "✅ <blank>".
        return {
            installed: code === 0,
            output: trimmedStdout,
            error: stderr.trim(),
            code: code ?? undefined,
            duration,
        };
    } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const err = error as {
            stdout?: string;
            stderr?: string;
            message: string;
            code?: number;
        };

        const result: CommandResultWithContext = {
            stdout: err.stdout || '',
            stderr: err.stderr || err.message,
            code: err.code || -1,
            duration,
            cwd: process.cwd(),
        };

        getLogger().logCommand(command, result);

        return {
            installed: false,
            error: err.message,
            code: err.code,
            duration,
        };
    }
}

export async function testBrowserLaunch(): Promise<BrowserLaunchTest> {
    // Probes that the opener binary exists — see browserProbeCommand for why
    // running its help flag was giving every Mac a false negative.
    const platform = os.platform();
    const { binary, probe } = browserProbeCommand(platform);
    const result = await checkCommand(probe);

    return { platform, command: binary, available: result.installed };
}

export async function testAdobeLogin(): Promise<AdobeLoginTest> {
    // Test if Adobe login command is available (without actually running it)
    const result = await checkCommand('aio auth login --help');
    return {
        available: result.installed,
        supportsForceFlag: result.installed && !!result.output && result.output.includes('-f'),
    };
}

export async function testFileSystem(): Promise<FileSystemTest> {
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
