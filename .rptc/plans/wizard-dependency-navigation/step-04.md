# Step 4: Edit Entry Point

**Purpose:** Add "Edit..." action to project card menu, check for running demo, and open wizard in edit mode with pre-populated project data.

**Prerequisites:**
- [ ] Step 1-3 completed
- [ ] All previous tests passing
- [ ] `loadProjectIntoWizardState()` function exists

---

## Tests to Write First

### Unit Tests: `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts`

#### Test Group 1: handleEditProject Handler

- [ ] **Test:** Returns error when project path not provided
  - **Given:** Payload with no projectPath
  - **When:** Call `handleEditProject(context, {})`
  - **Then:** Returns `{ success: false, error: 'Project path is required' }`
  - **File:** `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts`

- [ ] **Test:** Returns error for invalid project path
  - **Given:** Payload with path outside demo-builder directory
  - **When:** Call `handleEditProject(context, { projectPath: '/etc/passwd' })`
  - **Then:** Returns `{ success: false, error: 'Invalid project path' }`
  - **File:** `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts`

- [ ] **Test:** Returns error when project not found
  - **Given:** Payload with valid path format but project doesn't exist
  - **When:** Call `handleEditProject(context, { projectPath: '/valid/nonexistent' })`
  - **Then:** Returns `{ success: false, error: 'Project not found' }`
  - **File:** `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts`

- [ ] **Test:** Returns requiresStop when demo is running
  - **Given:** Project with status 'running'
  - **When:** Call `handleEditProject(context, { projectPath })`
  - **Then:** Returns `{ success: true, data: { requiresStop: true, projectName } }`
  - **File:** `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts`

- [ ] **Test:** Opens wizard with edit settings when demo is stopped
  - **Given:** Project with status 'ready' or 'stopped'
  - **When:** Call `handleEditProject(context, { projectPath })`
  - **Then:** Calls `vscode.commands.executeCommand('demoBuilder.createProject', { editProject: ... })`
  - **File:** `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts`

- [ ] **Test:** Extracts settings using settingsSerializer
  - **Given:** Valid project with adobe and component data
  - **When:** Call `handleEditProject(context, { projectPath })`
  - **Then:** Uses `extractSettingsFromProject()` to build edit settings
  - **File:** `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts`

### Component Tests: `tests/features/projects-dashboard/ui/components/ProjectActionsMenu-edit.test.tsx`

- [ ] **Test:** Renders Edit menu item when onEdit callback provided
  - **Given:** ProjectActionsMenu with onEdit prop
  - **When:** Open the menu
  - **Then:** Menu contains "Edit Project" item with Edit icon
  - **File:** `tests/features/projects-dashboard/ui/components/ProjectActionsMenu-edit.test.tsx`

- [ ] **Test:** Does not render Edit item when onEdit not provided
  - **Given:** ProjectActionsMenu without onEdit prop
  - **When:** Open the menu
  - **Then:** Menu does not contain "Edit Project" item
  - **File:** `tests/features/projects-dashboard/ui/components/ProjectActionsMenu-edit.test.tsx`

- [ ] **Test:** Calls onEdit with project when Edit item clicked
  - **Given:** ProjectActionsMenu with onEdit mock
  - **When:** Click "Edit Project" menu item
  - **Then:** onEdit called with project object
  - **File:** `tests/features/projects-dashboard/ui/components/ProjectActionsMenu-edit.test.tsx`

### Integration Tests: `tests/features/projects-dashboard/ui/ProjectsDashboard-edit.test.tsx`

- [ ] **Test:** Edit action triggers edit handler
  - **Given:** Dashboard with projects displayed
  - **When:** Click Edit on a project card menu
  - **Then:** Edit handler message sent to extension
  - **File:** `tests/features/projects-dashboard/ui/ProjectsDashboard-edit.test.tsx`

- [ ] **Test:** Shows stop demo warning when demo is running
  - **Given:** Project with running demo
  - **When:** Attempt to edit
  - **Then:** Warning message displayed with stop/cancel options
  - **File:** `tests/features/projects-dashboard/ui/ProjectsDashboard-edit.test.tsx`

---

## Files to Create/Modify

- [ ] `src/features/projects-dashboard/ui/components/ProjectActionsMenu.tsx` - Add Edit action
- [ ] `src/features/projects-dashboard/ui/components/ProjectCard.tsx` - Pass onEdit to menu
- [ ] `src/features/projects-dashboard/handlers/dashboardHandlers.ts` - Add handleEditProject
- [ ] `src/features/projects-dashboard/handlers/index.ts` - Export new handler
- [ ] `src/features/projects-dashboard/ui/ProjectsDashboard.tsx` - Wire edit handler
- [ ] `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts` - New test file

---

## Implementation Details

### RED Phase (Write failing tests first)

Create `tests/features/projects-dashboard/handlers/dashboardHandlers-edit.test.ts`:

```typescript
/**
 * Tests for project edit handler
 */

import * as vscode from 'vscode';
import { handleEditProject } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import type { HandlerContext } from '@/types/handlers';

// Mock vscode
jest.mock('vscode');

// Mock settingsSerializer
jest.mock('@/features/projects-dashboard/services/settingsSerializer', () => ({
    extractSettingsFromProject: jest.fn().mockReturnValue({
        version: 1,
        selections: { frontend: 'citisignal-nextjs' },
        configs: {},
    }),
}));

describe('handleEditProject', () => {
    const createMockContext = (projectOverrides = {}): HandlerContext => ({
        stateManager: {
            loadProjectFromPath: jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/Users/test/.demo-builder/projects/test-project',
                status: 'ready',
                ...projectOverrides,
            }),
        },
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
    } as unknown as HandlerContext);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return error when project path not provided', async () => {
        const context = createMockContext();
        const result = await handleEditProject(context, {});

        expect(result.success).toBe(false);
        expect(result.error).toBe('Project path is required');
    });

    it('should return error for invalid project path', async () => {
        const context = createMockContext();
        const result = await handleEditProject(context, {
            projectPath: '/etc/passwd',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid project path');
    });

    it('should return error when project not found', async () => {
        const context = createMockContext();
        (context.stateManager.loadProjectFromPath as jest.Mock).mockResolvedValue(null);

        const result = await handleEditProject(context, {
            projectPath: '/Users/test/.demo-builder/projects/nonexistent',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Project not found');
    });

    it('should return requiresStop when demo is running', async () => {
        const context = createMockContext({ status: 'running' });

        const result = await handleEditProject(context, {
            projectPath: '/Users/test/.demo-builder/projects/test-project',
        });

        expect(result.success).toBe(true);
        expect(result.data?.requiresStop).toBe(true);
        expect(result.data?.projectName).toBe('test-project');
    });

    it('should open wizard with edit settings when demo is stopped', async () => {
        const context = createMockContext({ status: 'ready' });

        const result = await handleEditProject(context, {
            projectPath: '/Users/test/.demo-builder/projects/test-project',
        });

        expect(result.success).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'demoBuilder.createProject',
            expect.objectContaining({
                editProject: expect.objectContaining({
                    projectPath: expect.any(String),
                }),
            })
        );
    });
});
```

### GREEN Phase (Minimal implementation)

1. Add `handleEditProject` to `src/features/projects-dashboard/handlers/dashboardHandlers.ts`:

```typescript
/**
 * Edit an existing project
 *
 * Checks if demo is running and opens wizard in edit mode.
 */
export const handleEditProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    try {
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
            };
        }

        // SECURITY: Validate path
        try {
            validateProjectPath(payload.projectPath);
        } catch {
            return {
                success: false,
                error: 'Invalid project path',
            };
        }

        // Load the project
        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        // Check if demo is running
        if (project.status === 'running') {
            return {
                success: true,
                data: {
                    requiresStop: true,
                    projectName: project.name,
                },
            };
        }

        // Extract settings for edit mode
        const settings = extractSettingsFromProject(project, true);

        context.logger.info(`Opening edit wizard for project: ${project.name}`);

        // Open wizard in edit mode
        await vscode.commands.executeCommand('demoBuilder.createProject', {
            editProject: {
                projectPath: project.path,
                projectName: project.name,
                settings,
            },
        });

        return {
            success: true,
            data: { success: true },
        };
    } catch (error) {
        context.logger.error('Failed to edit project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to edit project',
        };
    }
};
```

2. Update `ProjectActionsMenu.tsx` to include Edit action:

```typescript
// Add to MenuItem interface
interface MenuItem {
    key: string;
    label: string;
    icon: 'edit' | 'export' | 'delete';
}

export interface ProjectActionsMenuProps {
    project: Project;
    onEdit?: (project: Project) => void;  // Add this
    onExport?: (project: Project) => void;
    onDelete?: (project: Project) => void;
    className?: string;
}

// In component:
const handleMenuAction = useCallback((key: React.Key) => {
    if (key === 'edit' && onEdit) {
        onEdit(project);
    } else if (key === 'export' && onExport) {
        onExport(project);
    } else if (key === 'delete' && onDelete) {
        onDelete(project);
    }
}, [project, onEdit, onExport, onDelete]);

// In menuItems builder:
const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (onEdit) {
        items.push({ key: 'edit', label: 'Edit Project', icon: 'edit' });
    }
    if (onExport) {
        items.push({ key: 'export', label: 'Export Project', icon: 'export' });
    }
    if (onDelete) {
        items.push({ key: 'delete', label: 'Delete Project', icon: 'delete' });
    }
    return items;
}, [onEdit, onExport, onDelete]);

// In Menu render (add Edit icon):
{item.icon === 'edit' && <Edit size="S" />}
```

3. Wire up in `ProjectsDashboard.tsx`:

```typescript
const handleEditProject = useCallback(async (project: Project) => {
    try {
        const response = await webviewClient.request<{
            success: boolean;
            data?: { requiresStop?: boolean; projectName?: string };
            error?: string;
        }>('editProject', { projectPath: project.path });

        if (response?.data?.requiresStop) {
            // Show warning dialog
            // (Implementation depends on UI pattern)
        }
    } catch (error) {
        console.error('Failed to edit project:', error);
    }
}, []);
```

### REFACTOR Phase

1. Add proper icon import for Edit
2. Ensure consistent menu item ordering (Edit, Export, Delete)
3. Add logging for debugging
4. Re-run all tests

---

## Expected Outcome

- "Edit Project" appears in project card menu
- Clicking Edit checks if demo is running
- Running demo shows "Stop demo first" message
- Stopped demo opens wizard with project data

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] Edit menu item appears with Edit icon
- [ ] Handler validates project path
- [ ] Handler returns requiresStop for running demos
- [ ] Handler calls wizard command with edit settings
- [ ] Code follows project style guide
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 85% for new code

---

## Estimated Time

**3-4 hours**

- Writing handler tests: 1 hour
- Writing component tests: 1 hour
- Implementation: 1.5 hours
- Integration and cleanup: 30 minutes
