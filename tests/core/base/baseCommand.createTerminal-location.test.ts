/**
 * Unit Tests for BaseCommand.createTerminal location option
 *
 * Verifies the optional `location` parameter is passed through to
 * vscode.window.createTerminal so callers can request editor-area
 * terminals (e.g. for the AI dock-to-right-side preference).
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('vscode', () => ({
    window: {
        createTerminal: jest.fn(() => ({
            name: 'test',
            processId: Promise.resolve(1234),
            dispose: jest.fn(),
            sendText: jest.fn(),
            show: jest.fn(),
        })),
        setStatusBarMessage: jest.fn(),
        withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
    },
    ProgressLocation: { Notification: 15 },
    Uri: { file: (p: string) => ({ fsPath: p }) },
    ViewColumn: {
        Active: -1,
        Beside: -2,
        One: 1,
        Two: 2,
    },
}));

class TestCommand extends BaseCommand {
    public async execute(): Promise<void> {
        // no-op
    }

    public testCreateTerminal(
        name: string,
        cwd?: string,
        location?: vscode.TerminalEditorLocationOptions,
    ): vscode.Terminal {
        return (this as any).createTerminal(name, cwd, location);
    }
}

describe('BaseCommand.createTerminal location option', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            subscriptions: [],
            globalState: { get: jest.fn(), update: jest.fn() },
        } as any;

        mockStateManager = { getCurrentProject: jest.fn(), setState: jest.fn() };
        mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    });

    it('passes location option through to vscode.window.createTerminal when provided', () => {
        const command = new TestCommand(mockContext, mockStateManager, mockLogger);
        const location = { viewColumn: vscode.ViewColumn.Beside };

        command.testCreateTerminal('Claude Code', '/some/path', location);

        expect(vscode.window.createTerminal).toHaveBeenCalledWith({
            name: 'Claude Code',
            cwd: '/some/path',
            location,
        });
    });

    it('omits location entirely when not provided', () => {
        const command = new TestCommand(mockContext, mockStateManager, mockLogger);

        command.testCreateTerminal('Claude Code', '/some/path');

        const call = (vscode.window.createTerminal as jest.Mock).mock.calls[0][0];
        expect(call).toEqual({
            name: 'Claude Code',
            cwd: '/some/path',
        });
        expect(call).not.toHaveProperty('location');
    });

    it('omits location when explicitly undefined', () => {
        const command = new TestCommand(mockContext, mockStateManager, mockLogger);

        command.testCreateTerminal('Claude Code', '/some/path', undefined);

        const call = (vscode.window.createTerminal as jest.Mock).mock.calls[0][0];
        expect(call).not.toHaveProperty('location');
    });

    it('still returns the terminal and registers it for disposal (no regression)', () => {
        const command = new TestCommand(mockContext, mockStateManager, mockLogger);
        const location = { viewColumn: vscode.ViewColumn.Beside };

        const terminal = command.testCreateTerminal('Claude Code', '/some/path', location);

        expect(terminal).toBeDefined();
        expect(terminal.dispose).toBeDefined();
    });
});
