# Step 1: Projects Dashboard (Main Area)

## Objective

Create the `projects-dashboard` feature with UI components for displaying project cards in a grid layout, including empty state for first-time users.

## Test Strategy

### Unit Tests

1. **ProjectCard.test.tsx**
   - Renders project name
   - Shows running status with green indicator and port
   - Shows stopped status with gray indicator (no port)
   - Shows component list (stacked or count+toggle)
   - Click triggers onSelect callback
   - Handles missing optional fields gracefully

2. **ProjectsGrid.test.tsx**
   - Renders empty when no projects
   - Renders correct number of project cards
   - Responsive grid layout (2-3 columns)
   - Passes click handler to cards

3. **EmptyState.test.tsx**
   - Renders "No projects yet" message
   - Shows "Create Demo" CTA button
   - Click triggers onCreate callback

4. **ProjectsDashboard.test.tsx**
   - Shows empty state when no projects
   - Shows grid when projects exist
   - Shows search field when > 5 projects
   - "+ New" button triggers create action
   - Integrates with StateManager for project list

5. **dashboardHandlers.test.ts**
   - `getProjects` returns all projects from StateManager
   - `selectProject` sets current project
   - `createProject` triggers wizard

### Integration Tests

1. **ProjectsDashboard-integration.test.tsx**
   - Full flow: load projects → display → select
   - Empty state → create flow
   - Search/filter functionality

## Implementation Tasks

### 1.1 Create Feature Directory Structure

```
src/features/projects-dashboard/
├── index.ts
├── ui/
│   ├── index.tsx
│   ├── ProjectsDashboard.tsx
│   └── components/
│       ├── ProjectCard.tsx
│       ├── ProjectsGrid.tsx
│       └── EmptyState.tsx
├── handlers/
│   └── dashboardHandlers.ts
└── CLAUDE.md
```

### 1.2 Create ProjectCard Component

```typescript
// src/features/projects-dashboard/ui/components/ProjectCard.tsx

interface ProjectCardProps {
  project: Project;
  onSelect: (project: Project) => void;
}

// Display:
// - Project name (title)
// - Status indicator (● Running / ○ Stopped)
// - Port number (if running)
// - Component list (stacked or count+toggle based on card height)
```

**Project Card Content:**

| Field | Source | Display |
|-------|--------|---------|
| Name | `project.name` | Card title |
| Status | `project.status` | ● Running / ○ Stopped |
| Port | `componentInstances[frontend].port` | `:3000` (only if running) |
| Components | `componentInstances` | Stacked list or count + toggle |

### 1.3 Create ProjectsGrid Component

```typescript
// src/features/projects-dashboard/ui/components/ProjectsGrid.tsx

interface ProjectsGridProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
}

// Responsive grid layout (2-3 columns)
// Uses CSS Grid with auto-fit
```

### 1.4 Create EmptyState Component

```typescript
// src/features/projects-dashboard/ui/components/EmptyState.tsx

interface EmptyStateProps {
  onCreate: () => void;
}

// Centered card with:
// - "No projects yet" message
// - Primary CTA: "Create Demo" button
```

### 1.5 Create ProjectsDashboard Component

```typescript
// src/features/projects-dashboard/ui/ProjectsDashboard.tsx

// Main component that:
// - Shows EmptyState when no projects
// - Shows ProjectsGrid when projects exist
// - Includes search field (when > 5 projects) using SearchableList pattern
// - "+ New" button in header
```

### 1.6 Create Dashboard Handlers

```typescript
// src/features/projects-dashboard/handlers/dashboardHandlers.ts

// Message handlers:
// - getProjects: Returns all projects from StateManager
// - selectProject: Sets current project and navigates to detail
// - createProject: Opens wizard
```

### 1.7 Create Webview Entry Point

```typescript
// src/features/projects-dashboard/ui/index.tsx

// Entry point for webpack
// Renders ProjectsDashboard wrapped in WebviewApp
```

### 1.8 Add Webpack Entry Point

Update `webpack.config.js` to add new entry:

```javascript
entry: {
    // ... existing
    projectsDashboard: './src/features/projects-dashboard/ui/index.tsx'
}
```

## Acceptance Criteria

- [ ] ProjectCard displays project info correctly
- [ ] ProjectsGrid renders responsive card layout
- [ ] EmptyState shows CTA for first-time users
- [ ] ProjectsDashboard integrates all components
- [ ] Search/filter works when > 5 projects
- [ ] All handlers work correctly
- [ ] Webpack builds new entry point
- [ ] All tests pass with > 80% coverage

## Dependencies

- `@/core/state/stateManager` - For project data
- `@/core/ui/components/navigation/SearchableList` - For filtering
- `@/core/ui/components/ui/StatusDot` - For status indicator
- `@/types/base` - For Project interface
