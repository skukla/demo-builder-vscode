# Projects Navigation Architecture

**Status**: In Progress
**Created**: 2025-12-01
**Scope**: Navigation flow between Projects List, Project Detail, and sidebar states

---

## Summary

Implement a cohesive navigation architecture where:
- **Projects List** is the "home" screen when user has projects
- **Project Detail** shows controls for a selected project
- **Sidebar** is contextual: WelcomeView (no project) → Component TreeView (project loaded) → Timeline (wizard)

## Test Strategy

**Coverage Target**: 85%

**Testing Approach**:
- Unit tests for new commands and handlers
- Unit tests for React component rendering
- Integration tests for navigation flows
- Mock VS Code APIs (vscode.commands, vscode.window)

**Key Test Scenarios**:
1. Extension activation shows Projects List (when projects exist)
2. Empty state shown when no projects
3. Card click navigates to Project Detail
4. "← All Projects" returns to Projects List
5. Sidebar context switches based on state
6. TreeView shows with project name as title
7. Wizard flows update navigation correctly

## Architecture

### Sidebar Views (package.json)
```json
"views": {
  "demoBuilder": [
    {
      "id": "demoBuilder.sidebar",
      "name": "Demo Builder",
      "type": "webview",
      "when": "!demoBuilder.projectLoaded || demoBuilder.wizardActive"
    },
    {
      "id": "demoBuilder.components",
      "name": "Components",
      "type": "tree",
      "when": "demoBuilder.projectLoaded && !demoBuilder.wizardActive"
    }
  ]
}
```

### Context Variables

| Variable | When True |
|----------|-----------|
| `demoBuilder.projectLoaded` | A project is loaded in state |
| `demoBuilder.wizardActive` | Wizard panel is open |
| `demoBuilder.hasProjects` | User has at least one project |

## Existing Components to Reuse

| Component | Location | Usage |
|-----------|----------|-------|
| `ProjectsDashboard` | `src/features/projects-dashboard/ui/` | Projects List view |
| `ProjectCard` | `src/features/projects-dashboard/ui/components/` | Card in grid |
| `ProjectsGrid` | `src/features/projects-dashboard/ui/components/` | Grid layout |
| `DashboardEmptyState` | `src/features/projects-dashboard/ui/components/` | Empty state |
| `ComponentTreeProvider` | `src/features/components/providers/` | Component browser |
| `ProjectDashboardScreen` | `src/features/dashboard/ui/` | Project Detail |

## Implementation Constraints

- File size: All implementation files must be <500 lines
- Simplicity: No abstractions until pattern appears 3+ times (Rule of Three)
- Reuse: Leverage existing components (ProjectsDashboard, ComponentTreeProvider)
- Consistency: Follow existing command/handler patterns in codebase

## Acceptance Criteria

- [ ] Extension activates → Projects List shown (if projects exist)
- [ ] Empty state shown when no projects
- [ ] Click project card → Project Detail shown
- [ ] Sidebar shows Component TreeView with project name as title
- [ ] "← All Projects" returns to Projects List
- [ ] Wizard completion → Project Detail
- [ ] Wizard cancellation → Projects List
- [ ] All existing tests pass
- [ ] New tests for navigation flow

## Configuration

**Efficiency Review**: enabled
**Security Review**: enabled

## Steps

1. **Phase 1: Projects List as Home Screen** - Create showProjectsList command and wire activation
2. **Phase 2: Card Click → Project Detail** - Add card click handler and back navigation
3. **Phase 3: Component TreeView Sidebar** - Register TreeView and wire ComponentTreeProvider
4. **Phase 4: Context Variables & View Switching** - Set context on state changes
5. **Phase 5: Polish & Edge Cases** - Handle wizard flows and edge cases
