import { DEFAULT_SHELL } from '@/types/shell';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { Logger } from '@/core/logging';
import type { Project } from '@/types';

/**
 * ComponentUpdater Test Suite (Step 1 - Group 4)
 *
 * Tests for component update functionality with focus on:
 * - Shell parameter for unzip command (CRITICAL FIX)
 * - Update workflow (snapshot, download, extract, verify, merge)
 * - Rollback on failure
 * - Error handling
 *
 * Total tests: 6
 */

// Mock dependencies
jest.mock('@/core/logging');
jest.mock('@/core/di');
jest.mock('@/core/validation/securityValidation');
jest.mock('fs/promises');
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn()
    }
}), { virtual: true });

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di';

describe('ComponentUpdater (Step 1)', () => {
    let updater: ComponentUpdater;
    let mockLogger: jest.Mocked<Logger>;
    let mockProject: Project;
    let mockExecutor: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logger
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        // Mock executor with execute method
        mockExecutor = {
            execute: jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            })
        };

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock) = jest.fn().mockReturnValue(mockExecutor);

        // Mock security validation
        const securityValidation = require('@/core/validation/securityValidation');
        securityValidation.validateGitHubDownloadURL = jest.fn();

        // Mock fs operations using jest.spyOn
        jest.spyOn(fs, 'cp').mockResolvedValue(undefined);
        jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
        jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
        jest.spyOn(fs, 'readFile').mockResolvedValue('{"name": "test"}');
        jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
        jest.spyOn(fs, 'access').mockResolvedValue(undefined);
        jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
        jest.spyOn(fs, 'rename').mockResolvedValue(undefined);

        // Mock vscode.commands
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

        // Mock global fetch
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
        }) as any;

        updater = new ComponentUpdater(mockLogger);

        // Mock project
        mockProject = {
            path: '/path/to/project',
            name: 'test-project',
            componentInstances: {
                'test-component': {
                    id: 'test-component',
                    path: '/path/to/project/components/test-component',
                    port: 3000
                }
            },
            componentVersions: {}
        } as any;
    });

    describe('updateComponent() - Shell parameter for unzip (CRITICAL FIX)', () => {
        it('should use shell parameter for unzip command', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // CRITICAL: Verify shell parameter is passed to unzip command
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('unzip'),
                expect.objectContaining({
                    shell: DEFAULT_SHELL
                })
            );
        });

        it('should include timeout in shell command execution', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify timeout is included
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should include enhancePath in shell command execution', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify enhancePath is included
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    enhancePath: true
                })
            );
        });
    });

    describe('updateComponent() - Full workflow', () => {
        it('should create snapshot before update', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify snapshot creation
            expect(fs.cp).toHaveBeenCalledWith(
                '/path/to/project/components/test-component',
                expect.stringContaining('snapshot'),
                { recursive: true }
            );
        });

        it('should rollback on failure', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Simulate failure during extraction
            mockExecutor.execute.mockRejectedValueOnce(new Error('Extraction failed'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            // Verify rollback happened
            expect(fs.rename).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Rollback successful')
            );
        });

        it('should prevent concurrent updates to same component', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Start first update
            const update1 = updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Attempt concurrent update
            const update2 = updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // First should succeed, second should fail
            await expect(update1).resolves.not.toThrow();
            await expect(update2).rejects.toThrow('Update already in progress');
        });
    });
});
