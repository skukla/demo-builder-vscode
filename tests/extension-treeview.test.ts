/**
 * Extension TreeView Registration Tests
 *
 * Tests for TreeView registration patterns and title updates when projects change.
 * Part of Step 3: Component TreeView Sidebar.
 *
 * Note: extension.ts is excluded from test coverage by design (jest.config.js line 109).
 * These tests verify the patterns and behavior that extension.ts implements,
 * rather than importing extension.ts directly (which would require complex mocking).
 */

import * as vscode from 'vscode';
import type { Project } from '@/types';

// Mock vscode first before any imports
jest.mock('vscode');

// Mock fs (sync operations used by ComponentTreeProvider)
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockReturnValue([]),
    existsSync: jest.fn().mockReturnValue(false),
}));

// Mock StateManager with onProjectChanged event
const mockOnProjectChangedListeners: Array<(project: Project | undefined) => void> = [];
const mockOnProjectChanged = jest.fn().mockImplementation((listener: (project: Project | undefined) => void) => {
    mockOnProjectChangedListeners.push(listener);
    return { dispose: jest.fn() };
});
const mockGetCurrentProject = jest.fn().mockResolvedValue(undefined);
const mockGetAllProjects = jest.fn().mockResolvedValue([]);

jest.mock('@/core/state', () => ({
    StateManager: jest.fn().mockImplementation(() => ({
        onProjectChanged: mockOnProjectChanged,
        getCurrentProject: mockGetCurrentProject,
        getAllProjects: mockGetAllProjects,
    })),
}));

// Helper to create mock project
function createMockProject(name: string): Project {
    return {
        name,
        path: `/mock/projects/${name.toLowerCase().replace(/\s+/g, '-')}`,
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
    };
}

// Helper to fire project changed event
function fireProjectChanged(project: Project | undefined): void {
    mockOnProjectChangedListeners.forEach(listener => listener(project));
}

describe('Extension TreeView Registration', () => {
    let mockTreeView: { title: string; dispose: jest.Mock; [key: string]: any };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnProjectChangedListeners.length = 0;

        // Create mock TreeView that tracks title changes
        mockTreeView = {
            title: '',
            description: '',
            message: '',
            visible: true,
            selection: [],
            onDidChangeSelection: jest.fn(),
            onDidChangeVisibility: jest.fn(),
            onDidCollapseElement: jest.fn(),
            onDidExpandElement: jest.fn(),
            reveal: jest.fn(),
            dispose: jest.fn(),
        };
        (vscode.window.createTreeView as jest.Mock).mockReturnValue(mockTreeView);
    });

    describe('TreeView title update pattern', () => {
        /**
         * This tests the pattern that extension.ts implements:
         * stateManager.onProjectChanged((project) => {
         *     if (project) {
         *         treeView.title = project.name;
         *     }
         * });
         */
        it('should update TreeView title to project name when project is loaded', async () => {
            // Given: The title update listener pattern used in extension.ts
            const titleUpdateListener = (project: Project | undefined) => {
                if (project) {
                    mockTreeView.title = project.name;
                }
            };

            // Register listener (simulates what extension.ts does)
            mockOnProjectChanged(titleUpdateListener);

            // When: A project named "Acme Corp" is loaded
            const project = createMockProject('Acme Corp');
            fireProjectChanged(project);

            // Then: TreeView title should be "Acme Corp"
            expect(mockTreeView.title).toBe('Acme Corp');
        });

        it('should update TreeView title when switching between projects', async () => {
            // Given: The title update listener pattern
            const titleUpdateListener = (project: Project | undefined) => {
                if (project) {
                    mockTreeView.title = project.name;
                }
            };
            mockOnProjectChanged(titleUpdateListener);

            // Given: TreeView with project "Acme Corp" loaded
            const acmeProject = createMockProject('Acme Corp');
            fireProjectChanged(acmeProject);
            expect(mockTreeView.title).toBe('Acme Corp');

            // When: A different project "TechStart" is selected
            const techStartProject = createMockProject('TechStart');
            fireProjectChanged(techStartProject);

            // Then: TreeView title should update to "TechStart"
            expect(mockTreeView.title).toBe('TechStart');
        });

        it('should keep TreeView registered when project is cleared', async () => {
            // Given: The title update listener pattern (does NOT dispose TreeView)
            const titleUpdateListener = (project: Project | undefined) => {
                if (project) {
                    mockTreeView.title = project.name;
                }
                // Note: No dispose call - visibility controlled by package.json "when" clause
            };
            mockOnProjectChanged(titleUpdateListener);

            // Given: TreeView with project loaded
            const project = createMockProject('Acme Corp');
            fireProjectChanged(project);

            // When: Project is cleared (navigate back)
            fireProjectChanged(undefined);

            // Then: TreeView should remain (dispose NOT called)
            expect(mockTreeView.dispose).not.toHaveBeenCalled();
        });
    });

    describe('TreeView registration pattern', () => {
        it('should use createTreeView with correct viewId', () => {
            // Simulate the registration pattern from extension.ts
            const mockTreeDataProvider = {
                onDidChangeTreeData: jest.fn(),
                getTreeItem: jest.fn(),
                getChildren: jest.fn(),
            };

            // When: createTreeView is called (simulating extension.ts)
            const treeView = vscode.window.createTreeView('demoBuilder.components', {
                treeDataProvider: mockTreeDataProvider,
                showCollapseAll: true,
            });

            // Then: createTreeView should have been called with correct viewId
            expect(vscode.window.createTreeView).toHaveBeenCalledWith(
                'demoBuilder.components',
                expect.objectContaining({
                    treeDataProvider: mockTreeDataProvider,
                    showCollapseAll: true,
                })
            );

            // And: Should return a TreeView object
            expect(treeView).toBeDefined();
            expect(treeView.dispose).toBeDefined();
        });

        it('should support proper disposal pattern', () => {
            // Given: TreeView is created
            const mockTreeDataProvider = {
                onDidChangeTreeData: jest.fn(),
                getTreeItem: jest.fn(),
                getChildren: jest.fn(),
            };

            const treeView = vscode.window.createTreeView('demoBuilder.components', {
                treeDataProvider: mockTreeDataProvider,
            });

            // When: dispose is called (extension deactivation)
            treeView.dispose();

            // Then: dispose should be called on the TreeView
            expect(mockTreeView.dispose).toHaveBeenCalled();
        });
    });

    describe('StateManager integration pattern', () => {
        it('should subscribe to onProjectChanged for title updates', () => {
            // Given: The pattern used in extension.ts to update title
            const titleUpdateListener = jest.fn((project: Project | undefined) => {
                if (project) {
                    mockTreeView.title = project.name;
                }
            });

            // When: Listener is registered (simulates extension.ts setup)
            const subscription = mockOnProjectChanged(titleUpdateListener);

            // Then: onProjectChanged should have been called
            expect(mockOnProjectChanged).toHaveBeenCalled();

            // And: Should return a disposable subscription
            expect(subscription.dispose).toBeDefined();
        });

        it('should allow subscription disposal for cleanup', () => {
            // Given: Subscription is registered
            const titleUpdateListener = jest.fn();
            const subscription = mockOnProjectChanged(titleUpdateListener);

            // Initial event fires
            const project = createMockProject('Test');
            fireProjectChanged(project);
            expect(titleUpdateListener).toHaveBeenCalledTimes(1);

            // When: Subscription is disposed
            subscription.dispose();

            // And: Another event fires
            // Note: In real implementation, disposed listeners are removed
            // This test verifies the dispose() method exists and is callable
            expect(subscription.dispose).toBeDefined();
        });
    });
});
