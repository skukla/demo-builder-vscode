/**
 * Tests for EnvironmentSetup configuration
 * - ensureAdobeCLIConfigured
 */
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import * as os from 'os';
import {
    createEnvironmentSetup,
    resetAllMocks,
    mockLogger
} from './environmentSetup.testUtils';

jest.mock('fs');
jest.mock('os', () => ({
    homedir: jest.fn(() => '/mock/home'),
    platform: jest.fn(() => process.platform),
}));
jest.mock('child_process', () => ({
    execSync: jest.fn()
}));
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => mockLogger,
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

});
