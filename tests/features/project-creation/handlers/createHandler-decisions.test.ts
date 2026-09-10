/**
 * createHandler — the DECISIONS behind the payloads it sends.
 *
 * The four sibling suites assert with objectContaining almost everywhere, which
 * proves the fields they name and leaves the rest of every payload free. This
 * one pins the payloads WHOLE where the handler builds them, and drives the
 * three branches nothing reached: edit mode against the duplicate-name check,
 * edit mode against the failure cleanup, and a trust tip the user declined.
 */

import { handleCreateProject } from '@/features/project-creation/handlers/createHandler';

import * as executor from '@/features/project-creation/handlers/executor';
import * as _promiseUtils from '@/core/utils/promiseUtils';
import { ServiceLocator as _ServiceLocator } from '@/core/di/serviceLocator';
import * as vscode from 'vscode';
import * as _fs from 'fs';
import { promises as fsPromises } from 'fs';
import { AppError } from '@/core/errors';
import { ErrorCode } from '@/types/errorCodes';
import { GitHubAppNotInstalledError } from '@/features/eds/services/types';
import { MESH_DELETE_COMMAND } from '@/core/shell/meshDeleteCommand';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    createProjectCreationContext,
    setupDefaultMocks,
    mockExecutionFailure,
    setupMeshCleanupScenario,
    mockProjectDirectoryExists,
    mockConfig,
} from './createHandler.testUtils';
import { mockWorkspace } from '../../../helpers/vscodeMockViews';

// Mock all dependencies
jest.mock('@/core/validation/validators/ProjectNameValidator');
jest.mock('@/features/project-creation/handlers/executor');
jest.mock('@/core/utils/promiseUtils');
jest.mock('@/core/di/serviceLocator');
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    promises: {
        rm: jest.fn(),
    },
}));

const EXISTING = {
    name: 'existing-project',
    path: '/mock/home/.demo-builder/projects/existing-project',
    lastModified: new Date(),
};

describe('Project Creation - Create Handler - Decisions', () => {
    let mockContext: ReturnType<typeof createProjectCreationContext>;
    let mockCommandExecutor: ReturnType<typeof setupDefaultMocks>;

    beforeEach(() => {
        mockCommandExecutor = setupDefaultMocks();
        mockContext = createProjectCreationContext();
    });

    describe('the duplicate-name check in edit mode', () => {
        it('allows the project being edited to keep its own name', async () => {
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([EXISTING]);

            const result = await handleCreateProject(mockContext, {
                projectName: 'existing-project',
                editProjectPath: EXISTING.path,
            });

            expect(result.success).toBe(true);
            expect(executor.executeProjectCreation).toHaveBeenCalled();
            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
                'creationFailed',
                expect.anything()
            );
        });

        it('still rejects the name when edit mode points at a DIFFERENT project', async () => {
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([EXISTING]);

            const result = await handleCreateProject(mockContext, {
                projectName: 'existing-project',
                editProjectPath: '/mock/home/.demo-builder/projects/some-other-project',
            });

            expect(result.success).toBe(true);
            expect(executor.executeProjectCreation).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('creationFailed', {
                error: 'Project "existing-project" already exists. Please choose a different name or delete the existing project first.',
                isTimeout: false,
                elapsed: '0s',
            });
        });

        it('sends the validation-failure progress payload whole', async () => {
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([EXISTING]);

            await handleCreateProject(mockContext, { projectName: 'existing-project' });

            expect(mockContext.sendMessage).toHaveBeenCalledWith('creationProgress', {
                currentOperation: 'Failed',
                progress: 0,
                message: '',
                logs: [],
                error: 'Project "existing-project" already exists',
            });
        });
    });

    describe('the payloads a run sends whole', () => {
        it('opens with the Initializing progress payload', async () => {
            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenNthCalledWith(1, 'creationProgress', {
                currentOperation: 'Initializing',
                progress: 0,
                message: 'Preparing to create your project...',
                logs: [],
            });
        });

        it('sends the terminal Failed progress payload whole', async () => {
            mockExecutionFailure('Something broke');

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith('creationProgress', {
                currentOperation: 'Failed',
                progress: 0,
                message: '',
                logs: [],
                error: 'Something broke',
            });
        });

        it('sends the GitHub App progress payload whole', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new GitHubAppNotInstalledError('o', 'r', 'https://example.invalid/install')
            );

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith('creationProgress', {
                currentOperation: 'GitHub App Required',
                progress: 0,
                message: '',
                logs: [],
                error: 'The AEM Code Sync GitHub App must be installed to enable Edge Delivery Services.',
            });
        });
    });

    describe('how a failure is classified', () => {
        it('treats a CANCELLED code as cancelled even when nothing said "cancelled by user"', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new AppError('stopped', ErrorCode.CANCELLED)
            );

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationProgress',
                expect.objectContaining({ currentOperation: 'Cancelled' })
            );
            // A cancellation is not a failure: no creationFailed goes out.
            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
                'creationFailed',
                expect.anything()
            );
        });

        it('reports a rejection that is not an Error at all as a plain failure', async () => {
            // Nothing here carries a `cause`, which is the state the optional
            // chain on the cancellation check exists for.
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue('just a string');

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({ error: 'just a string', isTimeout: false })
            );
        });

        it('reports the elapsed time in minutes and seconds', async () => {
            let call = 0;
            const now = jest.spyOn(Date, 'now').mockImplementation(() => {
                call += 1;
                return call === 1 ? 1_000_000 : 1_125_000; // 2m 5s later
            });
            mockExecutionFailure('Something broke');

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({ elapsed: '2m 5s' })
            );
            now.mockRestore();
        });
    });

    describe('cleanup after a failure', () => {
        it('never deletes the project directory in edit mode', async () => {
            mockExecutionFailure('Edit failed');
            mockProjectDirectoryExists(true);

            await handleCreateProject(mockContext, {
                ...mockConfig,
                editProjectPath: '/mock/home/.demo-builder/projects/test-project',
            });

            expect(fsPromises.rm).not.toHaveBeenCalled();
            expect(mockContext.stateManager.clearProject).not.toHaveBeenCalled();
        });

        it('deletes an orphaned mesh with the exact command and options', async () => {
            mockExecutionFailure('Failed');
            setupMeshCleanupScenario(mockContext, false);

            await handleCreateProject(mockContext, mockConfig);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(MESH_DELETE_COMMAND, {
                timeout: TIMEOUTS.LONG,
                configureTelemetry: false,
                enhancePath: true,
                useNodeVersion: expect.any(String),
            });
        });
    });

    describe('the one-time workspace trust tip', () => {
        it('shows nothing further when the user skips it', async () => {
            mockWorkspace.isTrusted = false;
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Skip for Now');

            await handleCreateProject(mockContext, mockConfig);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        });

        it('shows the trusted-folders instructions when the user asks how', async () => {
            mockWorkspace.isTrusted = false;
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Learn How');

            await handleCreateProject(mockContext, mockConfig);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
            expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith(
                expect.stringContaining('Trusted Folders'),
                'Got it!'
            );
        });
    });
});
