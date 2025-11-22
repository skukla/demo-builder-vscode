/**
 * ComponentTreeProvider - Dispose Tests
 *
 * Tests for proper resource cleanup to prevent memory leaks.
 */

import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn(),
        dispose: jest.fn(),
    })),
    TreeItem: jest.fn(),
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
    },
    ThemeIcon: jest.fn().mockImplementation((name) => ({ id: name })),
    Uri: {
        file: jest.fn((path) => ({ fsPath: path })),
    },
}));

// Mock fs
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockReturnValue([]),
    existsSync: jest.fn().mockReturnValue(false),
}));

// Mock StateManager
const mockOnProjectChanged = jest.fn();
const mockGetCurrentProject = jest.fn().mockResolvedValue(null);
const mockGetAllProjects = jest.fn().mockResolvedValue([]);

jest.mock('@/core/state', () => ({
    StateManager: jest.fn().mockImplementation(() => ({
        onProjectChanged: mockOnProjectChanged,
        getCurrentProject: mockGetCurrentProject,
        getAllProjects: mockGetAllProjects,
    })),
}));

import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';
import { StateManager } from '@/core/state';

describe('ComponentTreeProvider', () => {
    let provider: ComponentTreeProvider;
    let mockStateManager: StateManager;
    let mockSubscriptionDisposable: vscode.Disposable;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock subscription that returns a disposable
        mockSubscriptionDisposable = { dispose: jest.fn() };
        mockOnProjectChanged.mockReturnValue(mockSubscriptionDisposable);

        mockStateManager = new StateManager({} as vscode.ExtensionContext);
        provider = new ComponentTreeProvider(mockStateManager, '/test/extension/path');
    });

    describe('dispose()', () => {
        it('should dispose the project change subscription', () => {
            // Given: A ComponentTreeProvider with an active subscription
            expect(mockOnProjectChanged).toHaveBeenCalled();

            // When: dispose() is called
            provider.dispose();

            // Then: The subscription should be disposed
            expect(mockSubscriptionDisposable.dispose).toHaveBeenCalled();
        });

        it('should dispose the EventEmitter', () => {
            // Given: A ComponentTreeProvider with an EventEmitter
            // (EventEmitter is created in constructor)

            // When: dispose() is called
            provider.dispose();

            // Then: The EventEmitter should be disposed
            // Access the internal _onDidChangeTreeData via the provider
            expect(provider['_onDidChangeTreeData'].dispose).toHaveBeenCalled();
        });
    });
});
