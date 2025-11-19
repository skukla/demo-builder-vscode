import { handleCreateProject } from '@/features/project-creation/handlers/createHandler';
import * as validation from '@/core/validation';
import * as executor from '@/features/project-creation/handlers/executor';
import * as promiseUtils from '@/core/utils/promiseUtils';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import {
    createMockContext,
    setupDefaultMocks,
    mockConfig,
} from './createHandler.testUtils';

// Mock all dependencies
jest.mock('@/core/validation');
jest.mock('@/features/project-creation/handlers/executor');
jest.mock('@/core/utils/promiseUtils');
jest.mock('@/core/di');
jest.mock('vscode');
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    promises: {
        rm: jest.fn(),
    },
}));

describe('Project Creation - Create Handler - Happy Path', () => {
    let mockContext: ReturnType<typeof createMockContext>;
    let mockCommandExecutor: ReturnType<typeof setupDefaultMocks>;

    beforeEach(() => {
        mockCommandExecutor = setupDefaultMocks();
        mockContext = createMockContext();
    });

    describe('successful project creation', () => {
        it('should create project successfully', async () => {
            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(validation.validateProjectNameSecurity).toHaveBeenCalledWith('test-project');
            expect(executor.executeProjectCreation).toHaveBeenCalledWith(mockContext, mockConfig);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationProgress',
                expect.objectContaining({
                    currentOperation: 'Initializing',
                    progress: 0,
                })
            );
        });

        it('should create AbortController for cancellation support', async () => {
            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sharedState.projectCreationAbortController).toBeUndefined(); // Cleaned up in finally
        });

        it('should pass AbortController signal to withTimeout', async () => {
            await handleCreateProject(mockContext, mockConfig);

            expect(promiseUtils.withTimeout).toHaveBeenCalledWith(
                expect.any(Promise),
                expect.objectContaining({
                    signal: expect.any(AbortSignal),
                })
            );
        });
    });

    describe('workspace trust prompts', () => {
        it('should show workspace trust tip on first run', async () => {
            (vscode.workspace as any).isTrusted = false;

            // Create function that captures the mocked return value
            let tipShown = false;
            const getMock = jest.fn().mockImplementation((key: string, defaultValue: boolean) => {
                if (key === 'demoBuilder.trustTipShown') {
                    return tipShown;
                }
                return defaultValue;
            });

            (mockContext.context.globalState.get as jest.Mock) = getMock;

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.context.globalState.get).toHaveBeenCalledWith(
                'demoBuilder.trustTipShown',
                false
            );
            expect(mockContext.context.globalState.update).toHaveBeenCalledWith(
                'demoBuilder.trustTipShown',
                true
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Trust all Demo Builder projects'),
                'Learn How',
                'Skip for Now'
            );
        });

        it('should not show workspace trust tip if already shown', async () => {
            (vscode.workspace as any).isTrusted = false;

            // Create function that returns true for tipShown
            const getMock = jest.fn().mockImplementation((key: string, defaultValue: boolean) => {
                if (key === 'demoBuilder.trustTipShown') {
                    return true;
                }
                return defaultValue;
            });

            (mockContext.context.globalState.get as jest.Mock) = getMock;

            await handleCreateProject(mockContext, mockConfig);

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should not show workspace trust tip if workspace already trusted', async () => {
            (vscode.workspace as any).isTrusted = true;

            await handleCreateProject(mockContext, mockConfig);

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should show detailed instructions if user clicks "Learn How"', async () => {
            (vscode.workspace as any).isTrusted = false;

            // Create function that returns false for tipShown
            const getMock = jest.fn().mockImplementation((key: string, defaultValue: boolean) => {
                if (key === 'demoBuilder.trustTipShown') {
                    return false;
                }
                return defaultValue;
            });

            (mockContext.context.globalState.get as jest.Mock) = getMock;
            (vscode.window.showInformationMessage as jest.Mock)
                .mockResolvedValueOnce('Learn How')
                .mockResolvedValueOnce(undefined);

            await handleCreateProject(mockContext, mockConfig);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
            expect(vscode.window.showInformationMessage).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('Add'),
                'Got it!'
            );
        });

        it('should handle user clicking "Skip for Now"', async () => {
            (vscode.workspace as any).isTrusted = false;

            // Create function that returns false for tipShown
            const getMock = jest.fn().mockImplementation((key: string, defaultValue: boolean) => {
                if (key === 'demoBuilder.trustTipShown') {
                    return false;
                }
                return defaultValue;
            });

            (mockContext.context.globalState.get as jest.Mock) = getMock;
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Skip for Now');

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(executor.executeProjectCreation).toHaveBeenCalled();
        });
    });
});
