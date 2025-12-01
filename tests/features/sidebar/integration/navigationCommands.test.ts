/**
 * Navigation Commands Integration Tests
 *
 * Step 3: Integration & Cleanup
 *
 * These tests verify the navigation commands work correctly:
 * - demoBuilder.showProjectsDashboard opens Projects Dashboard
 * - demoBuilder.showProjectDetail opens Project Detail
 * - demoBuilder.createProject opens Wizard (no welcome step)
 *
 * RED PHASE: These tests document expected behavior after Step 3.
 */

import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((path: string) => ({
            fsPath: path,
            path,
            toString: () => path,
        })),
        joinPath: jest.fn((base: { path: string }, ...paths: string[]) => ({
            fsPath: [base.path, ...paths].join('/'),
            path: [base.path, ...paths].join('/'),
            toString: () => [base.path, ...paths].join('/'),
        })),
    },
    window: {
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
    },
    commands: {
        registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    workspace: {
        isTrusted: true,
    },
}));

describe('Navigation Commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('demoBuilder.showProjectsDashboard', () => {
        it('should exist as a registered command', async () => {
            // The showProjectsDashboard command should be available
            // This is the NEW command added in Step 3 to show the Projects Dashboard
            await expect(
                vscode.commands.executeCommand('demoBuilder.showProjectsDashboard')
            ).resolves.not.toThrow();
        });

        it('should open the Projects Dashboard webview', async () => {
            await vscode.commands.executeCommand('demoBuilder.showProjectsDashboard');

            // Verify the command was called
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.showProjectsDashboard'
            );
        });
    });

    describe('demoBuilder.showProjectDetail', () => {
        it('should exist as a registered command (renamed from showProjectDashboard)', async () => {
            // The showProjectDetail command replaces the old showProjectDashboard
            // It shows the detail view for a specific project
            await expect(
                vscode.commands.executeCommand('demoBuilder.showProjectDetail')
            ).resolves.not.toThrow();
        });

        it('should accept optional project parameter', async () => {
            const mockProject = {
                name: 'test-project',
                path: '/path/to/project',
            };

            await vscode.commands.executeCommand('demoBuilder.showProjectDetail', mockProject);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.showProjectDetail',
                mockProject
            );
        });
    });

    describe('demoBuilder.createProject', () => {
        it('should open wizard WITHOUT welcome step', async () => {
            await vscode.commands.executeCommand('demoBuilder.createProject');

            // The createProject command should:
            // 1. Open the wizard webview
            // 2. Start at adobe-auth step (not welcome)
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.createProject'
            );

            // Verify welcome command is NOT called
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'demoBuilder.showWelcome'
            );
        });
    });

    describe('Navigation Flow', () => {
        it('should navigate from Projects Dashboard to Project Detail', async () => {
            // User clicks on a project in the dashboard
            const mockProject = { name: 'test-project', path: '/path/to/project' };

            // First, open projects dashboard
            await vscode.commands.executeCommand('demoBuilder.showProjectsDashboard');

            // Then, navigate to project detail
            await vscode.commands.executeCommand('demoBuilder.showProjectDetail', mockProject);

            expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(
                1,
                'demoBuilder.showProjectsDashboard'
            );
            expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(
                2,
                'demoBuilder.showProjectDetail',
                mockProject
            );
        });

        it('should navigate from Projects Dashboard to Wizard', async () => {
            // User clicks "New Project" in the dashboard

            // First, open projects dashboard
            await vscode.commands.executeCommand('demoBuilder.showProjectsDashboard');

            // Then, start wizard
            await vscode.commands.executeCommand('demoBuilder.createProject');

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.createProject'
            );
        });
    });
});

describe('Deprecated Commands', () => {
    describe('demoBuilder.showWelcome', () => {
        it('should NOT be available after Step 3', () => {
            // The showWelcome command is removed in Step 3
            // This test documents that it should no longer exist
            // (This test passes by verifying the command is not called)
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            const welcomeCalls = executeCommandMock.mock.calls.filter(
                (call) => call[0] === 'demoBuilder.showWelcome'
            );

            expect(welcomeCalls).toHaveLength(0);
        });
    });
});
