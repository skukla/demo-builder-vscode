/**
 * Tests for EnvironmentSetup path discovery functionality
 * - findFnmPath
 * - findNpmGlobalPaths
 */
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { DEFAULT_SHELL } from '@/types/shell';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    createEnvironmentSetup,
    mockFnmInstallation,
    mockFnmVersions,
    mockNvmVersions,
    resetAllMocks,
    mockLogger
} from './environmentSetup.testUtils';

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

describe('EnvironmentSetup - Path Discovery', () => {
    let environmentSetup: EnvironmentSetup;
    let mockHomeDir: string;

    beforeEach(() => {
        resetAllMocks();
        mockHomeDir = '/mock/home';
        (os.homedir as jest.Mock).mockReturnValue(mockHomeDir);
        environmentSetup = createEnvironmentSetup(mockHomeDir);
    });

    describe('DEFAULT_SHELL constant', () => {
        it('should have access to DEFAULT_SHELL constant', () => {
            expect(DEFAULT_SHELL).toBeDefined();
            expect(typeof DEFAULT_SHELL).toBe('string');
        });

        it('should use correct shell for platform', () => {
            if (process.platform === 'win32') {
                expect(DEFAULT_SHELL).toBe('cmd.exe');
            } else {
                expect(DEFAULT_SHELL).toBe('/bin/bash');
            }
        });
    });

    describe('findFnmPath', () => {
        it('should find fnm in Homebrew location on Apple Silicon', () => {
            mockFnmInstallation('/opt/homebrew/bin/fnm');

            const result = environmentSetup.findFnmPath();

            expect(result).toBe('/opt/homebrew/bin/fnm');
        });

        it('should find fnm in Homebrew location on Intel Mac', () => {
            mockFnmInstallation('/usr/local/bin/fnm');

            const result = environmentSetup.findFnmPath();

            expect(result).toBe('/usr/local/bin/fnm');
        });

        it('should find fnm in manual install location', () => {
            const manualPath = path.join(mockHomeDir, '.local/bin/fnm');
            mockFnmInstallation(manualPath);

            const result = environmentSetup.findFnmPath();

            expect(result).toBe(manualPath);
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
});
