/**
 * Tests for EnvironmentSetup Node version management
 * - getInfrastructureNodeVersion
 * - findAdobeCLINodeVersion
 */
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    createEnvironmentSetup,
    mockVSCodeExtension,
    resetAllMocks,
} from './environmentSetup.testUtils';

jest.mock('fs');
jest.mock('os', () => ({
    homedir: jest.fn(() => '/mock/home'),
    platform: jest.fn(() => process.platform),
}));
jest.mock('child_process', () => ({
    execSync: jest.fn()
}));

describe('EnvironmentSetup - Node Version Management', () => {
    let environmentSetup: EnvironmentSetup;
    let mockHomeDir: string;

    beforeEach(() => {
        resetAllMocks();
        mockHomeDir = '/mock/home';
        (os.homedir as jest.Mock).mockReturnValue(mockHomeDir);

        // Create a fresh instance and explicitly clear all caches
        environmentSetup = createEnvironmentSetup(mockHomeDir);
        const caches = environmentSetup as unknown as {
            cachedAdobeCLINodeVersion: string | null | undefined;
            cachedFnmPath: string | null | undefined;
        };
        caches.cachedAdobeCLINodeVersion = undefined;
        caches.cachedFnmPath = undefined;
    });

    describe('getInfrastructureNodeVersion', () => {
        it('should read Node version from components.json', async () => {
            mockVSCodeExtension({
                infrastructure: {
                    'adobe-cli': {
                        configuration: { nodeVersion: '18' }
                    }
                }
            });

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
            mockVSCodeExtension({
                infrastructure: {
                    'adobe-cli': {}
                }
            });

            const result = await environmentSetup.getInfrastructureNodeVersion('adobe-cli');

            expect(result).toBeNull();
        });
    });

    describe('findAdobeCLINodeVersion', () => {
        const FNM = path.join('/mock/home', '.local/share/fnm/node-versions');

        /** components.json names `catalog` for aio, and fnm has aio under each of `withAio`. */
        function catalogAndFnm(catalog: string, withAio: string[]): void {
            delete process.env.FNM_DIR;
            const componentsPath = path.join(mockVSCodeExtension().extensionPath,
                'src', 'features', 'components', 'config', 'components.json');
            const aioPaths = new Set(withAio.map((v) => path.join(FNM, v, 'installation/bin/aio')));
            (fsSync.existsSync as jest.Mock).mockImplementation((p: string) =>
                p === componentsPath || p === FNM || aioPaths.has(p));
            (fsSync.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                infrastructure: { 'adobe-cli': { configuration: { nodeVersion: catalog } } },
            }));
            (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) =>
                dir === FNM ? ['v18.20.8', 'v20.19.6', 'v22.21.1', 'v24.22.1'] : []);
        }

        const warn = () =>
            (environmentSetup as unknown as { logger: { warn: jest.Mock } }).logger.warn;

        it('picks the catalog version when it has aio, even when older ones have it too', async () => {
            catalogAndFnm('24', ['v18.20.8', 'v20.19.6', 'v24.22.1']);

            await expect(environmentSetup.findAdobeCLINodeVersion()).resolves.toBe('24');
            expect(warn()).not.toHaveBeenCalled();
        });

        it('falls back to the NEWEST version with aio when the catalog version lacks it, and says so', async () => {
            catalogAndFnm('24', ['v18.20.8', 'v20.19.6']);

            await expect(environmentSetup.findAdobeCLINodeVersion()).resolves.toBe('20');
            // The fallback is an event, not silence. Its wording is not the contract.
            expect(warn()).toHaveBeenCalledTimes(1);
        });

        it('should use infrastructure-defined version first', async () => {
            mockVSCodeExtension({
                infrastructure: {
                    'adobe-cli': {
                        configuration: { nodeVersion: '18' }
                    }
                }
            });

            const result = await environmentSetup.findAdobeCLINodeVersion();

            expect(result).toBe('18');
        });

        it('should scan fnm for aio-cli installation', async () => {
            // Ensure FNM_DIR is not set
            delete process.env.FNM_DIR;

            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

            const fnmBase = path.join(mockHomeDir, '.local/share/fnm/node-versions');
            const aioPath = path.join(fnmBase, 'v18.0.0/installation/bin/aio');
            const nvmBase = path.join(mockHomeDir, '.nvm/versions/node');

            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                // fnm paths exist
                if (checkPath === fnmBase || checkPath === aioPath) {
                    return true;
                }
                // nvm paths don't exist
                if (checkPath === nvmBase || checkPath.includes('.nvm')) {
                    return false;
                }
                return false;
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
            mockVSCodeExtension({
                infrastructure: {
                    'adobe-cli': {
                        configuration: { nodeVersion: '18' }
                    }
                }
            });

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

        it('should respect FNM_DIR when scanning for Adobe CLI installation', async () => {
            // Given: FNM_DIR environment variable is set to custom location
            const customFnmDir = '/custom/fnm';
            process.env.FNM_DIR = customFnmDir;

            // No infrastructure version
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

            const fnmBase = path.join(customFnmDir, 'node-versions');
            const aioPath = path.join(fnmBase, 'v18.0.0/installation/bin/aio');

            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                return checkPath === fnmBase || checkPath === aioPath;
            });

            (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
                if (dir === fnmBase) {
                    return ['v18.0.0'];
                }
                return [];
            });

            // When: findAdobeCLINodeVersion is called
            const result = await environmentSetup.findAdobeCLINodeVersion();

            // Then: Returns version from custom FNM_DIR
            expect(result).toBe('18');

            // Cleanup
            delete process.env.FNM_DIR;
        });

        it('should use default fnm path when FNM_DIR is not set for Adobe CLI scanning', async () => {
            // Given: FNM_DIR environment variable is NOT set
            delete process.env.FNM_DIR;

            // No infrastructure version
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

            const fnmBase = path.join(mockHomeDir, '.local/share/fnm/node-versions');
            const aioPath = path.join(fnmBase, 'v20.0.0/installation/bin/aio');
            const nvmBase = path.join(mockHomeDir, '.nvm/versions/node');

            (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
                // fnm paths exist
                if (checkPath === fnmBase || checkPath === aioPath) {
                    return true;
                }
                // nvm paths don't exist
                if (checkPath === nvmBase || checkPath.includes('.nvm')) {
                    return false;
                }
                return false;
            });

            (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
                if (dir === fnmBase) {
                    return ['v20.0.0'];
                }
                return [];
            });

            // When: findAdobeCLINodeVersion is called
            const result = await environmentSetup.findAdobeCLINodeVersion();

            // Then: Returns version from default fnm location
            expect(result).toBe('20');
        });

        it('should cache null Adobe CLI version result', async () => {
            // Given: No Adobe CLI is installed anywhere
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
            (fsSync.existsSync as jest.Mock).mockReturnValue(false);

            // First call - returns null
            const result1 = await environmentSetup.findAdobeCLINodeVersion();
            expect(result1).toBeNull();

            // Clear mock call counts to verify caching
            (fsSync.existsSync as jest.Mock).mockClear();
            (fsSync.readdirSync as jest.Mock).mockClear();

            // When: findAdobeCLINodeVersion is called again
            const result2 = await environmentSetup.findAdobeCLINodeVersion();

            // Then: Returns null without rescanning directories
            expect(result2).toBeNull();
            // existsSync should not be called again (cached result)
            expect(fsSync.existsSync).not.toHaveBeenCalled();
        });
    });
});
