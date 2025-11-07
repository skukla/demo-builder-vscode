import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import type { CommandResult, ExecuteOptions } from '@/core/shell/types';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

jest.mock('fs');
jest.mock('os', () => ({
    homedir: jest.fn(() => '/mock/home'),
}));
jest.mock('vscode');
jest.mock('child_process', () => ({
    execSync: jest.fn()
}));
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('EnvironmentSetup', () => {
    let environmentSetup: EnvironmentSetup;
    let mockHomeDir: string;

    beforeEach(() => {
        jest.clearAllMocks();

        // Define mockHomeDir explicitly to prevent undefined in full suite
        mockHomeDir = '/mock/home';
        (os.homedir as jest.Mock).mockReturnValue(mockHomeDir);

        // Mock vscode.extensions API
        (vscode as any).extensions = {
            getExtension: jest.fn()
        };

        // Reset static flags in EnvironmentSetup
        (EnvironmentSetup as any).telemetryConfigured = false;
        (EnvironmentSetup as any).checkingTelemetry = false;
        (EnvironmentSetup as any).nodeVersionConfigured = false;
        (EnvironmentSetup as any).checkingNodeVersion = false;

        environmentSetup = new EnvironmentSetup();

        // Reset instance caches
        (environmentSetup as any).cachedFnmPath = undefined;
        (environmentSetup as any).cachedAdobeCLINodeVersion = undefined;
    });

    describe('findFnmPath', () => {
        it('should find fnm in Homebrew location on Apple Silicon', () => {
            (fsSync.existsSync as jest.Mock).mockImplementation((path: string) => {
                return path === '/opt/homebrew/bin/fnm';
            });

            const result = environmentSetup.findFnmPath();

            expect(result).toBe('/opt/homebrew/bin/fnm');
        });

        it('should find fnm in Homebrew location on Intel Mac', () => {
            (fsSync.existsSync as jest.Mock).mockImplementation((path: string) => {
                return path === '/usr/local/bin/fnm';
            });

            const result = environmentSetup.findFnmPath();

            expect(result).toBe('/usr/local/bin/fnm');
        });

        it('should find fnm in manual install location', () => {
            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                return checkPath === path.join(mockHomeDir, '.local/bin/fnm');
            });

            const result = environmentSetup.findFnmPath();

            expect(result).toBe(path.join(mockHomeDir, '.local/bin/fnm'));
        });

        it('should cache fnm path after first lookup', () => {
            (fsSync.existsSync as jest.Mock).mockReturnValue(true);

            const result1 = environmentSetup.findFnmPath();
            const result2 = environmentSetup.findFnmPath();

            expect(result1).toBe(result2);
            // existsSync should only be called once per path in first lookup
            expect(fsSync.existsSync).toHaveBeenCalledTimes(1);
        });

        it('should return null when fnm is not found', () => {
            const { execSync } = require('child_process');
            (fsSync.existsSync as jest.Mock).mockReturnValue(false);
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error('Command not found');
            });

            const result = environmentSetup.findFnmPath();

            expect(result).toBeNull();
        });
    });

    describe('findNpmGlobalPaths', () => {
        it('should find fnm node version paths', () => {
            // Ensure FNM_DIR is not set
            delete process.env.FNM_DIR;

            // Ensure mockHomeDir is set and os.homedir() returns it
            mockHomeDir = '/mock/home';
            (os.homedir as jest.Mock).mockReturnValue(mockHomeDir);

            const fnmBase = path.join(mockHomeDir, '.local/share/fnm/node-versions');
            const nvmBase = path.join(mockHomeDir, '.nvm/versions/node');
            const installationBinPath = path.join(fnmBase, 'v18.0.0/installation/bin');
            const nodeModulesBinPath = path.join(fnmBase, 'v18.0.0/installation/lib/node_modules/.bin');

            // Mock existsSync to return true for fnm paths, false for others
            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                // FNM base directory
                if (checkPath === fnmBase) {
                    return true;
                }
                // FNM version-specific paths
                if (checkPath === installationBinPath || checkPath === nodeModulesBinPath) {
                    return true;
                }
                // NVM paths - all false for this test
                if (checkPath === nvmBase || checkPath.includes('.nvm')) {
                    return false;
                }
                // All other home directory paths - false
                if (checkPath.includes(mockHomeDir)) {
                    return false;
                }
                // Common paths - all false for this test to isolate fnm results
                return false;
            });

            // Mock readdirSync to return version directories
            (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
                if (dir === fnmBase) {
                    return ['v18.0.0'];
                }
                if (dir === nvmBase) {
                    return [];
                }
                return [];
            });

            const result = environmentSetup.findNpmGlobalPaths();

            // Verify the fnm paths are included
            expect(result).toContain(installationBinPath);
            expect(result).toContain(nodeModulesBinPath);
        });

        it('should find nvm node version paths', () => {
            const nvmBase = path.join(mockHomeDir, '.nvm/versions/node');

            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                return checkPath === nvmBase ||
                       checkPath === path.join(nvmBase, 'v18.0.0/bin');
            });

            (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
                if (dir === nvmBase) {
                    return ['v18.0.0'];
                }
                return [];
            });

            const result = environmentSetup.findNpmGlobalPaths();

            expect(result).toContain(path.join(nvmBase, 'v18.0.0/bin'));
        });

        it('should respect FNM_DIR environment variable', () => {
            const customFnmDir = '/custom/fnm';
            process.env.FNM_DIR = customFnmDir;

            const fnmBase = path.join(customFnmDir, 'node-versions');

            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                return checkPath === fnmBase ||
                       checkPath === path.join(fnmBase, 'v18.0.0/installation/bin');
            });

            (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
                if (dir === fnmBase) {
                    return ['v18.0.0'];
                }
                return [];
            });

            const result = environmentSetup.findNpmGlobalPaths();

            expect(result).toContain(path.join(fnmBase, 'v18.0.0/installation/bin'));

            delete process.env.FNM_DIR;
        });

        it('should include common npm global locations', () => {
            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                return checkPath === '/usr/local/bin' ||
                       checkPath === '/opt/homebrew/bin';
            });

            (fsSync.readdirSync as jest.Mock).mockReturnValue([]);

            const result = environmentSetup.findNpmGlobalPaths();

            expect(result).toContain('/usr/local/bin');
            expect(result).toContain('/opt/homebrew/bin');
        });

        it('should handle missing directories gracefully', () => {
            (fsSync.existsSync as jest.Mock).mockReturnValue(false);
            (fsSync.readdirSync as jest.Mock).mockImplementation(() => {
                throw new Error('Directory not found');
            });

            const result = environmentSetup.findNpmGlobalPaths();

            // Should return array (possibly empty) without throwing
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('getInfrastructureNodeVersion', () => {
        it('should read Node version from components.json', async () => {
            const mockExtension = {
                extensionPath: '/path/to/extension'
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockExtension);

            const componentsPath = path.join(mockExtension.extensionPath, 'templates', 'components.json');
            (fsSync.existsSync as jest.Mock).mockImplementation((p) => p === componentsPath);
            (fsSync.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            }));

            const result = await environmentSetup.getInfrastructureNodeVersion('adobe-cli');

            expect(result).toBe('18');
        });

        it('should return null when extension not found', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

            const result = await environmentSetup.getInfrastructureNodeVersion('adobe-cli');

            expect(result).toBeNull();
        });

        it('should return null when components.json not found', async () => {
            const mockExtension = {
                extensionPath: '/path/to/extension'
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockExtension);
            (fsSync.existsSync as jest.Mock).mockReturnValue(false);

            const result = await environmentSetup.getInfrastructureNodeVersion('adobe-cli');

            expect(result).toBeNull();
        });

        it('should return null when component has no nodeVersion', async () => {
            const mockExtension = {
                extensionPath: '/path/to/extension'
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockExtension);
            (fsSync.existsSync as jest.Mock).mockReturnValue(true);
            (fsSync.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                infrastructure: {
                    'adobe-cli': {}
                }
            }));

            const result = await environmentSetup.getInfrastructureNodeVersion('adobe-cli');

            expect(result).toBeNull();
        });
    });

    describe('findAdobeCLINodeVersion', () => {
        it('should use infrastructure-defined version first', async () => {
            const mockExtension = {
                extensionPath: '/path/to/extension'
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockExtension);
            (fsSync.existsSync as jest.Mock).mockReturnValue(true);
            (fsSync.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            }));

            const result = await environmentSetup.findAdobeCLINodeVersion();

            expect(result).toBe('18');
        });

        it('should scan fnm for aio-cli installation', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

            const fnmBase = path.join(mockHomeDir, '.local/share/fnm/node-versions');

            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                return checkPath === fnmBase ||
                       checkPath === path.join(fnmBase, 'v18.0.0/installation/bin/aio');
            });

            (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
                if (dir === fnmBase) {
                    return ['v18.0.0'];
                }
                return [];
            });

            const result = await environmentSetup.findAdobeCLINodeVersion();

            expect(result).toBe('18');
        });

        it('should scan nvm for aio-cli installation', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

            const nvmBase = path.join(mockHomeDir, '.nvm/versions/node');

            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                return checkPath === nvmBase ||
                       checkPath === path.join(nvmBase, 'v18.0.0/bin/aio');
            });

            (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
                if (dir === nvmBase) {
                    return ['v18.0.0'];
                }
                return [];
            });

            const result = await environmentSetup.findAdobeCLINodeVersion();

            expect(result).toBe('18');
        });

        it('should cache result after first lookup', async () => {
            const mockExtension = {
                extensionPath: '/path/to/extension'
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockExtension);
            (fsSync.existsSync as jest.Mock).mockReturnValue(true);
            (fsSync.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            }));

            const result1 = await environmentSetup.findAdobeCLINodeVersion();
            const result2 = await environmentSetup.findAdobeCLINodeVersion();

            expect(result1).toBe(result2);
            // Should only read file once
            expect(fsSync.readFileSync).toHaveBeenCalledTimes(1);
        });

        it('should return null when no Adobe CLI found', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
            (fsSync.existsSync as jest.Mock).mockReturnValue(false);

            const result = await environmentSetup.findAdobeCLINodeVersion();

            expect(result).toBeNull();
        });
    });

    describe('ensureAdobeCLINodeVersion', () => {
        it('should skip if already set for session', async () => {
            const executeCommand = jest.fn();

            // Call twice
            await environmentSetup.ensureAdobeCLINodeVersion(executeCommand);
            await environmentSetup.ensureAdobeCLINodeVersion(executeCommand);

            // Should only setup once
            expect(executeCommand).not.toHaveBeenCalled();
        });

        it('should switch Node version when needed', async () => {
            // Reset session first
            environmentSetup.resetSession();

            const mockExtension = {
                extensionPath: '/path/to/extension'
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockExtension);
            (fsSync.existsSync as jest.Mock).mockReturnValue(true);
            (fsSync.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            }));

            const executeCommand = jest.fn()
                .mockResolvedValueOnce({ stdout: '9.4.0', stderr: '', code: 0, duration: 100 }) // fnm --version
                .mockResolvedValueOnce({ stdout: 'v16.0.0', stderr: '', code: 0, duration: 100 }) // fnm current
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 }); // fnm use

            await environmentSetup.ensureAdobeCLINodeVersion(executeCommand);

            expect(executeCommand).toHaveBeenCalledWith(
                'fnm use 18 --silent-if-unchanged',
                expect.any(Object)
            );
        });

        it('should handle concurrent calls with lock', async () => {
            environmentSetup.resetSession();

            const mockExtension = {
                extensionPath: '/path/to/extension'
            };
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(mockExtension);
            (fsSync.existsSync as jest.Mock).mockReturnValue(true);
            (fsSync.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            }));

            const executeCommand = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            });

            // Call multiple times concurrently
            await Promise.all([
                environmentSetup.ensureAdobeCLINodeVersion(executeCommand),
                environmentSetup.ensureAdobeCLINodeVersion(executeCommand),
                environmentSetup.ensureAdobeCLINodeVersion(executeCommand)
            ]);

            // Setup should only happen once despite concurrent calls
            expect(executeCommand.mock.calls.length).toBeLessThanOrEqual(3);
        });
    });

    describe('ensureAdobeCLIConfigured', () => {
        it('should set telemetry opt-out', async () => {
            const executeCommand = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            });

            await environmentSetup.ensureAdobeCLIConfigured(executeCommand);

            expect(executeCommand).toHaveBeenCalledWith(
                'aio config set aio-cli-telemetry.optOut true',
                expect.objectContaining({
                    configureTelemetry: false,
                    timeout: 5000
                })
            );
        });

        it('should only configure once per session', async () => {
            const executeCommand = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            });

            await environmentSetup.ensureAdobeCLIConfigured(executeCommand);
            await environmentSetup.ensureAdobeCLIConfigured(executeCommand);

            // Should only call once
            expect(executeCommand).toHaveBeenCalledTimes(1);
        });

        it('should handle errors gracefully', async () => {
            const executeCommand = jest.fn().mockRejectedValue(new Error('Config failed'));

            await expect(
                environmentSetup.ensureAdobeCLIConfigured(executeCommand)
            ).resolves.not.toThrow();
        });
    });

    describe('buildCommandWithEnvironment', () => {
        it('should wrap command with fnm exec for specific version', () => {
            const result = environmentSetup.buildCommandWithEnvironment('node --version', {
                useNodeVersion: '18'
            });

            expect(result).toContain('fnm use 18');
            expect(result).toContain('node --version');
        });

        it('should use fnm env for current version', () => {
            const result = environmentSetup.buildCommandWithEnvironment('node --version', {
                useNodeVersion: 'current'
            });

            expect(result).toContain('fnm env');
            expect(result).toContain('node --version');
        });

        it('should skip fnm when already on target version', () => {
            const result = environmentSetup.buildCommandWithEnvironment('node --version', {
                useNodeVersion: '18',
                currentFnmVersion: 'v18.1.0'
            });

            expect(result).toBe('node --version');
        });

        it('should return original command when no version specified', () => {
            const result = environmentSetup.buildCommandWithEnvironment('node --version', {});

            expect(result).toBe('node --version');
        });
    });

    describe('session management', () => {
        it('should track session Node version', () => {
            expect(environmentSetup.isSessionNodeVersionSet()).toBe(false);

            environmentSetup.resetSession();

            expect(environmentSetup.getSessionNodeVersion()).toBeNull();
        });

        it('should reset session state', () => {
            environmentSetup.resetSession();

            expect(environmentSetup.isSessionNodeVersionSet()).toBe(false);
            expect(environmentSetup.getSessionNodeVersion()).toBeNull();
        });
    });
});
