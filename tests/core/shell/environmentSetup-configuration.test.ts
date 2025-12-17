/**
 * Tests for EnvironmentSetup configuration and environment setup
 * - ensureAdobeCLINodeVersion
 * - ensureAdobeCLIConfigured
 * - buildCommandWithEnvironment
 * - session management
 */
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { DEFAULT_SHELL } from '@/types/shell';
import * as fsSync from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import {
    createEnvironmentSetup,
    createMockExecuteCommand,
    mockVSCodeExtension,
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

describe('EnvironmentSetup - Configuration', () => {
    let environmentSetup: EnvironmentSetup;
    let mockHomeDir: string;

    beforeEach(() => {
        resetAllMocks();
        mockHomeDir = '/mock/home';
        (os.homedir as jest.Mock).mockReturnValue(mockHomeDir);
        environmentSetup = createEnvironmentSetup(mockHomeDir);
    });

    describe('ensureAdobeCLINodeVersion', () => {
        it('should pass shell option when checking fnm availability', async () => {
            environmentSetup.resetSession();

            mockVSCodeExtension({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            });

            const executeCommand = createMockExecuteCommand();

            await environmentSetup.ensureAdobeCLINodeVersion(executeCommand);

            // Verify shell option passed to fnm --version check
            const fnmVersionCall = executeCommand.mock.calls.find(call =>
                call[0].includes('fnm --version')
            );
            expect(fnmVersionCall).toBeDefined();
            expect(fnmVersionCall![1]).toHaveProperty('shell', DEFAULT_SHELL);
        });

        it('should pass shell option when getting fnm version', async () => {
            environmentSetup.resetSession();

            mockVSCodeExtension({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            });

            const executeCommand = createMockExecuteCommand();

            await environmentSetup.ensureAdobeCLINodeVersion(executeCommand);

            // Verify shell option passed to fnm current check
            const fnmCurrentCall = executeCommand.mock.calls.find(call =>
                call[0].includes('fnm current')
            );
            expect(fnmCurrentCall).toBeDefined();
            expect(fnmCurrentCall![1]).toHaveProperty('shell', DEFAULT_SHELL);
        });

        it('should skip if already set for session', async () => {
            // Reset mocks to ensure no Node version is found
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
            (fsSync.existsSync as jest.Mock).mockReturnValue(false);

            const executeCommand = jest.fn();

            // Call twice
            await environmentSetup.ensureAdobeCLINodeVersion(executeCommand);
            await environmentSetup.ensureAdobeCLINodeVersion(executeCommand);

            // Should only setup once (no commands executed because no Node version found)
            expect(executeCommand).not.toHaveBeenCalled();
        });

        it('should switch Node version when needed', async () => {
            // Reset session first
            environmentSetup.resetSession();

            mockVSCodeExtension({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            });

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

            mockVSCodeExtension({
                infrastructure: {
                    'adobe-cli': {
                        nodeVersion: '18'
                    }
                }
            });

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

        it('should only log success when exit code is 0', async () => {
            const executeCommand = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,  // Success
                duration: 100
            });

            await environmentSetup.ensureAdobeCLIConfigured(executeCommand);

            // Verify debug() was called (technical message, not user-facing)
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Configured aio-cli to opt out of telemetry')
            );
        });

        it('should log failure when exit code is non-zero', async () => {
            const executeCommand = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: 'Command failed',
                code: 1,  // Failure
                duration: 100
            });

            await environmentSetup.ensureAdobeCLIConfigured(executeCommand);

            // Verify debug() was called (failure message)
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Failed to configure (exit code 1)')
            );
            // Verify info() was NOT called (no false success)
            expect(mockLogger.info).not.toHaveBeenCalledWith(
                expect.stringContaining('Configured aio-cli to opt out of telemetry')
            );
        });

        it('should mark as configured even after failure', async () => {
            const executeCommand = jest.fn().mockResolvedValue({
                stdout: '',
                stderr: 'Command failed',
                code: 1,
                duration: 100
            });

            await environmentSetup.ensureAdobeCLIConfigured(executeCommand);
            await environmentSetup.ensureAdobeCLIConfigured(executeCommand);

            // Should only attempt once (marked as configured despite failure)
            expect(executeCommand).toHaveBeenCalledTimes(1);
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
