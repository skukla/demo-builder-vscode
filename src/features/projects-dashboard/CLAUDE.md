# Projects Dashboard Feature

## Overview

The Projects Dashboard is the main entry point for the Demo Builder extension. It displays all projects in a card grid layout, replacing the previous Welcome Screen.

## Purpose

- Provide a "home screen" for users to see all their projects
- Enable quick project selection and creation
- Show project status at a glance (running/stopped, port, components)
- Support filtering when users have many projects

## Architecture

```
projects-dashboard/
├── index.ts                    # Public exports
├── commands/
│   └── showProjectsList.ts     # Projects List webview command (home screen)
├── ui/
│   ├── index.tsx               # Webview entry point
│   ├── ProjectsDashboard.tsx   # Main dashboard component
│   └── components/
│       ├── index.ts            # Component exports
│       ├── ProjectCard.tsx     # Single project card
│       ├── ProjectsGrid.tsx    # Responsive card grid
│       └── DashboardEmptyState.tsx  # Empty state with CTA
├── handlers/
│   ├── index.ts                # Handler exports
│   ├── dashboardHandlers.ts    # Dashboard message handlers
│   └── projectsListHandlers.ts # Projects list message handlers (object literal)
└── CLAUDE.md                   # This file
```

## Components

### ProjectsDashboard

Main container component that orchestrates the dashboard UI.

**Props:**
- `projects: Project[]` - Array of all projects
- `onSelectProject: (project: Project) => void` - Called when a card is clicked
- `onCreateProject: () => void` - Called when "+ New" is clicked
- `isLoading?: boolean` - Shows loading spinner when true

**Features:**
- Shows empty state when no projects
- Shows search field when > 5 projects
- "+ New" button in header

### ProjectCard

Displays a single project as a clickable card.

**Props:**
- `project: Project` - The project to display
- `onSelect: (project: Project) => void` - Click handler

**Displays:**
- Project name (title)
- Status indicator (● Running / ○ Stopped)
- Port number (if running)
- Component list (stacked)

### ProjectsGrid

Responsive grid layout for project cards.

**Props:**
- `projects: Project[]` - Array of projects
- `onSelectProject: (project: Project) => void` - Card click handler

**Layout:**
- Uses CSS Grid with `auto-fill, minmax(280px, 1fr)`
- 2-3 columns depending on viewport

### DashboardEmptyState

Empty state for first-time users with CTA and utility icons.

**Props:**
- `onCreate: () => void` - Create button click handler
- `title?: string` - Custom title (default: "No projects yet")
- `buttonText?: string` - Custom button text (default: "New")
- `autoFocus?: boolean` - Auto-focus the button
- `onOpenDocs?: () => void` - Documentation icon click handler
- `onOpenHelp?: () => void` - Help icon click handler
- `onOpenSettings?: () => void` - Settings icon click handler

**Note:** The utility icons only render if at least one icon callback is provided.

## Command

### ShowProjectsListCommand

The main command for displaying the Projects List as the home screen.

**Command ID:** `demoBuilder.showProjectsList`

**File:** `commands/showProjectsList.ts`

**Features:**
- Extends `BaseWebviewCommand` for standardized webview management
- Uses `projectsListHandlers` object literal with `dispatchHandler` for message handling
- Loads the `projectsList` webpack bundle (4-bundle pattern)
- Auto-shows on extension activation when no current project

**Usage:**
```typescript
await vscode.commands.executeCommand('demoBuilder.showProjectsList');
```

## Handler Map

### projectsListHandlers

Object literal handler map for the Projects List view, used with `dispatchHandler`.

**File:** `handlers/projectsListHandlers.ts`

**Registered Handlers:**
- `getProjects` - Load all projects
- `selectProject` - Select a project and navigate to dashboard
- `createProject` - Trigger project creation wizard

**Usage:**
```typescript
import { projectsListHandlers } from './handlers';
import { dispatchHandler } from '@/core/handlers';

const result = await dispatchHandler(projectsListHandlers, context, 'getProjects', {});
```

## Handlers

All handlers follow **Pattern B** (return values, not sendMessage):

### handleGetProjects

Returns all projects with full data.

```typescript
const result = await handleGetProjects(context);
// { success: true, data: { projects: Project[] } }
```

### handleSelectProject

Selects a project by path.

```typescript
const result = await handleSelectProject(context, { projectPath: '/path/to/project' });
// { success: true, data: { project: Project } }
```

### handleCreateProject

Triggers the project creation wizard.

```typescript
const result = await handleCreateProject(context);
// { success: true }
```

## Message Types

| Message | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `getProjects` | UI → Extension | - | `{ success, data: { projects } }` |
| `selectProject` | UI → Extension | `{ projectPath }` | `{ success, data: { project } }` |
| `createProject` | UI → Extension | - | `{ success }` |
| `openDocs` | UI → Extension | - | `{ success }` |
| `openHelp` | UI → Extension | - | `{ success }` |
| `openSettings` | UI → Extension | - | `{ success }` |
| `projectsUpdated` | Extension → UI | `{ projects }` | - |

## Styling

Uses existing design system:
- React Spectrum components (Flex, Text, Button, SearchField)
- Spectrum design tokens (size-100, size-200, etc.)
- Custom CSS for cards (`project-card` class)
- VS Code theme variables

## Testing

Tests located in `tests/features/projects-dashboard/`:

```
tests/features/projects-dashboard/
├── testUtils.ts                          # Shared test utilities
├── handlers/
│   └── dashboardHandlers.test.ts         # Handler tests
└── ui/
    ├── ProjectsDashboard.test.tsx        # Main component tests
    └── components/
        ├── ProjectCard.test.tsx          # Card tests
        ├── ProjectsGrid.test.tsx         # Grid tests
        └── DashboardEmptyState.test.tsx  # Empty state tests
```

## Dependencies

- `@/core/ui/components/ui/StatusDot` - Status indicator
- `@/core/ui/components/WebviewApp` - Root wrapper
- `@/core/ui/utils/WebviewClient` - Extension communication
- `@/core/state/stateManager` - Project data
- `@/types/base` - Project interface

## Related Features

- **sidebar** - Provides navigation context
- **dashboard** - Project detail view shown when project card is clicked
- **project-creation** - Wizard triggered by "+ New" button
