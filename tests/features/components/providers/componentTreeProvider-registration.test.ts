/**
 * ComponentTreeProvider Registration Tests
 *
 * Tests for ComponentTreeProvider behavior when used with TreeView registration.
 * Part of Step 3: Component TreeView Sidebar.
 */

import * as vscode from 'vscode';
import type { Project, ComponentInstance } from '@/types';

// Mock vscode module
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn(),
        dispose: jest.fn(),
    })),
    TreeItem: jest.fn().mockImplementation((label, collapsibleState) => ({
        label,
        collapsibleState,
    })),
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
    },
    ThemeIcon: Object.assign(
        jest.fn().mockImplementation((name) => ({ id: name })),
        {
            File: { id: 'file' },
            Folder: { id: 'folder' },
        }
    ),
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
const mockOnProjectChangedListeners: Array<(project: Project | undefined) => void> = [];
const mockOnProjectChanged = jest.fn().mockImplementation((listener: (project: Project | undefined) => void) => {
    mockOnProjectChangedListeners.push(listener);
    return { dispose: jest.fn() };
});
const mockGetCurrentProject = jest.fn();
const mockGetAllProjects = jest.fn();

jest.mock('@/core/state', () => ({
    StateManager: jest.fn().mockImplementation(() => ({
        onProjectChanged: mockOnProjectChanged,
        getCurrentProject: mockGetCurrentProject,
        getAllProjects: mockGetAllProjects,
    })),
}));

import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';
import { StateManager } from '@/core/state';
import * as fs from 'fs';

// Helper to create mock project with components
function createMockProjectWithComponents(name: string, components: Record<string, Partial<ComponentInstance>>): Project {
    const componentInstances: Record<string, ComponentInstance> = {};

    for (const [id, component] of Object.entries(components)) {
        componentInstances[id] = {
            id,
            name: component.name || id,
            type: component.type || 'dependency',
            status: component.status || 'ready',
            path: component.path || `/mock/projects/${name}/components/${id}`,
            lastUpdated: new Date(),
            icon: component.icon,
            subType: component.subType,
        };
    }

    return {
        name,
        path: `/mock/projects/${name}`,
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        componentInstances,
    };
}

// Helper to fire project changed event
function fireProjectChanged(project: Project | undefined): void {
    mockOnProjectChangedListeners.forEach(listener => listener(project));
}

describe('ComponentTreeProvider - Registration Behavior', () => {
    let provider: ComponentTreeProvider;
    let mockStateManager: StateManager;

    /**
     * Wait for cache initialization to complete.
     * The ComponentTreeProvider initializes its cache asynchronously in the constructor.
     * We need to wait for this to complete before testing getChildren().
     */
    async function waitForCacheInit(): Promise<void> {
        // Allow microtasks to process (async cache initialization)
        await new Promise(resolve => setImmediate(resolve));
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnProjectChangedListeners.length = 0;

        // Reset mocks to default state
        mockGetCurrentProject.mockResolvedValue(null);
        mockGetAllProjects.mockResolvedValue([]);

        mockStateManager = new StateManager({} as vscode.ExtensionContext);
    });

    afterEach(() => {
        if (provider) {
            provider.dispose();
        }
    });

    describe('getChildren() with project loaded', () => {
        it('should return component tree items when a project is loaded', async () => {
            // Given: A project is loaded in state with components
            const project = createMockProjectWithComponents('Acme Corp', {
                'headless': {
                    name: 'CitiSignal NextJS',
                    type: 'frontend',
                    icon: 'symbol-color',
                },
                'demo-inspector': {
                    name: 'Demo Inspector',
                    type: 'utility',
                    subType: 'inspector',
                },
            });
            // Set up mocks BEFORE creating provider (cache reads during constructor)
            mockGetCurrentProject.mockResolvedValue(project);

            // When: ComponentTreeProvider is instantiated
            provider = new ComponentTreeProvider(mockStateManager, '/test/extension/path');
            await waitForCacheInit();

            // Then: getChildren() should return component tree items
            const children = await provider.getChildren();

            expect(children).toBeDefined();
            expect(children.length).toBe(2);
        });

        it('should return items with appropriate icons and labels', async () => {
            // Given: A project with components is loaded
            const project = createMockProjectWithComponents('Acme Corp', {
                'headless': {
                    name: 'CitiSignal NextJS',
                    type: 'frontend',
                    icon: 'symbol-color',
                },
            });
            // Set up mocks BEFORE creating provider (cache reads during constructor)
            mockGetCurrentProject.mockResolvedValue(project);

            // When: ComponentTreeProvider is instantiated
            provider = new ComponentTreeProvider(mockStateManager, '/test/extension/path');
            await waitForCacheInit();

            // Then: Each item should have appropriate icon and label
            const children = await provider.getChildren();

            expect(children.length).toBeGreaterThan(0);
            // Items should have the component name as label
            const item = children[0];
            expect(item.label).toBe('CitiSignal NextJS');
        });
    });

    describe('getChildren() without project loaded', () => {
        it('should return project list when no project is loaded but projects exist', async () => {
            // Given: No project is loaded but projects exist
            // Set up mocks BEFORE creating provider (cache reads during constructor)
            mockGetCurrentProject.mockResolvedValue(null);
            mockGetAllProjects.mockResolvedValue([
                { name: 'Project 1', path: '/projects/1', lastModified: new Date() },
                { name: 'Project 2', path: '/projects/2', lastModified: new Date() },
            ]);

            // When: ComponentTreeProvider is instantiated
            provider = new ComponentTreeProvider(mockStateManager, '/test/extension/path');
            await waitForCacheInit();

            // Then: getChildren() should return project list
            const children = await provider.getChildren();

            expect(children).toBeDefined();
            expect(children.length).toBe(2);
        });

        it('should return empty state message when no projects exist', async () => {
            // Given: No project is loaded and no projects exist
            // Set up mocks BEFORE creating provider (cache reads during constructor)
            mockGetCurrentProject.mockResolvedValue(null);
            mockGetAllProjects.mockResolvedValue([]);

            // When: ComponentTreeProvider is instantiated
            provider = new ComponentTreeProvider(mockStateManager, '/test/extension/path');
            await waitForCacheInit();

            // Then: getChildren() should return empty state (welcome message)
            const children = await provider.getChildren();

            expect(children).toBeDefined();
            // Should return a "Get Started" welcome item
            expect(children.length).toBe(1);
            expect(children[0].label).toBe('Get Started');
        });
    });

    describe('refresh() behavior', () => {
        it('should trigger tree refresh when project files change', async () => {
            // Given: ComponentTreeProvider and project is loaded
            const project = createMockProjectWithComponents('Acme Corp', {
                'headless': { name: 'CitiSignal NextJS' },
            });
            mockGetCurrentProject.mockResolvedValue(project);
            provider = new ComponentTreeProvider(mockStateManager, '/test/extension/path');
            await waitForCacheInit();

            // Spy on the onDidChangeTreeData event
            const fireSpy = provider['_onDidChangeTreeData'].fire;

            // When: refresh() is called (simulating project files change)
            provider.refresh();

            // Then: The tree should be refreshed (fire event called)
            expect(fireSpy).toHaveBeenCalled();
        });

        it('should auto-refresh when project changes via stateManager', async () => {
            // Given: ComponentTreeProvider subscribed to stateManager.onProjectChanged
            provider = new ComponentTreeProvider(mockStateManager, '/test/extension/path');
            await waitForCacheInit();
            const fireSpy = provider['_onDidChangeTreeData'].fire;

            // When: Project changes in state
            const newProject = createMockProjectWithComponents('TechStart', {
                'component-1': { name: 'Component 1' },
            });
            fireProjectChanged(newProject);

            // Then: Tree should auto-refresh
            expect(fireSpy).toHaveBeenCalled();
        });
    });

    describe('getTreeItem()', () => {
        it('should return the element as TreeItem', async () => {
            // Given: A tree element
            provider = new ComponentTreeProvider(mockStateManager, '/test/extension/path');
            await waitForCacheInit();
            const mockElement = {
                label: 'Test Component',
                collapsibleState: 1,
            };

            // When: getTreeItem is called
            const result = provider.getTreeItem(mockElement as any);

            // Then: It should return the same element
            expect(result).toBe(mockElement);
        });
    });
});
