/**
 * Shared test utilities for EnvironmentSetup tests
 */
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import * as fsSync from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';

/**
 * Mock logger instance
 */
export const mockLogger = {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
};

/**
 * Setup all Jest mocks for EnvironmentSetup tests
 */
export function setupMocks() {
    jest.mock('fs');
    jest.mock('os', () => ({
        homedir: jest.fn(() => '/mock/home'),
        platform: jest.fn(() => process.platform),
    }));
    jest.mock('vscode');
    jest.mock('child_process', () => ({
        execSync: jest.fn()
    }));
    jest.mock('@/core/logging/debugLogger', () => ({
        getLogger: () => mockLogger
    }));
}

/**
 * Create a fresh EnvironmentSetup instance with reset state
 */
export function createEnvironmentSetup(mockHomeDir: string = '/mock/home'): EnvironmentSetup {
    // Mock vscode.extensions API
    (vscode as any).extensions = {
        getExtension: jest.fn()
    };

    // Mock os.homedir
    (os.homedir as jest.Mock).mockReturnValue(mockHomeDir);

    // Reset static flags in EnvironmentSetup
    (EnvironmentSetup as any).telemetryConfigured = false;
    (EnvironmentSetup as any).checkingTelemetry = false;
    (EnvironmentSetup as any).nodeVersionConfigured = false;
    (EnvironmentSetup as any).checkingNodeVersion = false;

    const instance = new EnvironmentSetup();

    // Reset instance caches
    (instance as any).cachedFnmPath = undefined;
    (instance as any).cachedAdobeCLINodeVersion = undefined;

    return instance;
}

/**
 * Mock VS Code extension with components.json
 */
export function mockVSCodeExtension(componentConfig?: any) {
    const mockExtension = {
        extensionPath: '/path/to/extension'
    };

    (vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockExtension);

    if (componentConfig !== undefined) {
        const componentsPath = require('path').join(mockExtension.extensionPath, 'templates', 'components.json');
        (fsSync.existsSync as jest.Mock).mockImplementation((p) => p === componentsPath);
        (fsSync.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(componentConfig));
    }

    return mockExtension;
}

/**
 * Mock fnm installation at specified path
 */
export function mockFnmInstallation(fnmPath: string) {
    (fsSync.existsSync as jest.Mock).mockImplementation((path: string) => {
        return path === fnmPath;
    });
}

/**
 * Mock fnm node versions directory structure
 */
export interface FnmVersionMock {
    baseDir: string;
    versions: string[];
}

export function mockFnmVersions(config: FnmVersionMock) {
    const { baseDir, versions } = config;

    (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
        // Base directory
        if (checkPath === baseDir) {
            return true;
        }

        // Version-specific paths
        for (const version of versions) {
            const installationBinPath = require('path').join(baseDir, `${version}/installation/bin`);
            const nodeModulesBinPath = require('path').join(baseDir, `${version}/installation/lib/node_modules/.bin`);

            if (checkPath === installationBinPath || checkPath === nodeModulesBinPath) {
                return true;
            }
        }

        return false;
    });

    (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === baseDir) {
            return versions;
        }
        return [];
    });
}

/**
 * Mock nvm node versions directory structure
 */
export interface NvmVersionMock {
    baseDir: string;
    versions: string[];
}

export function mockNvmVersions(config: NvmVersionMock) {
    const { baseDir, versions } = config;

    (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
        // Base directory
        if (checkPath === baseDir) {
            return true;
        }

        // Version-specific bin paths
        for (const version of versions) {
            const binPath = require('path').join(baseDir, `${version}/bin`);
            if (checkPath === binPath) {
                return true;
            }
        }

        return false;
    });

    (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === baseDir) {
            return versions;
        }
        return [];
    });
}

/**
 * Mock execute command function for testing
 */
export interface MockExecuteConfig {
    fnmVersion?: string;
    currentNodeVersion?: string;
    useNodeVersion?: string;
    telemetryResult?: { stdout: string; stderr: string; code: number; duration: number };
}

export function createMockExecuteCommand(config: MockExecuteConfig = {}) {
    const {
        fnmVersion = 'fnm 1.38.1',
        currentNodeVersion = 'v20.19.5',
        useNodeVersion = '',
        telemetryResult = { stdout: '', stderr: '', code: 0, duration: 100 }
    } = config;

    return jest.fn((command: string, options?: any) => {
        if (command.includes('fnm --version')) {
            return Promise.resolve({ stdout: fnmVersion, stderr: '', code: 0, duration: 100 });
        }
        if (command.includes('fnm current')) {
            return Promise.resolve({ stdout: currentNodeVersion, stderr: '', code: 0, duration: 100 });
        }
        if (command.includes('fnm use')) {
            return Promise.resolve({ stdout: useNodeVersion, stderr: '', code: 0, duration: 100 });
        }
        if (command.includes('aio config set')) {
            return Promise.resolve(telemetryResult);
        }
        return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 100 });
    });
}

/**
 * Reset all mocks
 */
export function resetAllMocks() {
    jest.clearAllMocks();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
}
