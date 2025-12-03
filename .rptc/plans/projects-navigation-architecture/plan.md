# Projects Navigation Architecture Plan

**Status**: 📋 Ready for Review
**Created**: 2025-12-01
**Scope**: Navigation flow between Projects List, Project Detail, and sidebar states

---

## Overview

Implement a cohesive navigation architecture where:
- **Projects List** is the "home" screen when user has projects
- **Project Detail** shows controls for a selected project
- **Sidebar** is contextual: WelcomeView (no project) → Component TreeView (project loaded) → Timeline (wizard)

## Current State

```
┌─────────────────┐     ┌─────────────────────────────────────────────────────┐
│    SIDEBAR      │     │                   MAIN PANEL                        │
├─────────────────┤     ├─────────────────────────────────────────────────────┤
│                 │     │                                                     │
│  WELCOME VIEW   │     │         (No clear "home" screen)                    │
│                 │     │                                                     │
│  [+ New Demo]   │     │   - Welcome webview exists but rarely shown         │
│                 │     │   - Project Dashboard exists but no way to get      │
│  ─────────────  │     │     back to project list                            │
│  📖 Docs        │     │   - Projects List component exists but not wired    │
│  ❓ Help        │     │                                                     │
│  ⚙️  Settings   │     │                                                     │
│                 │     │                                                     │
└─────────────────┘     └─────────────────────────────────────────────────────┘

Problems:
- No clear entry point when user has multiple projects
- No way to switch between projects from Project Dashboard
- Sidebar doesn't show component browser when project loaded
- ComponentTreeProvider exists but isn't wired up
```

## Target State

```
STATE 1: No Project Selected (Projects List = Home)
─────────────────────────────────────────────────────────────────────────────────
┌─────────────────┐     ┌─────────────────────────────────────────────────────┐
│  DEMO BUILDER   │     │  Your Projects                     [+ New]          │
├─────────────────┤     │  ┌─────────────────────────┐                        │
│                 │     │  │ 🔍 Filter projects...   │                        │
│  [+ New Demo]   │     │  └─────────────────────────┘                        │
│                 │     │                                                     │
│  ─────────────  │     │  ┌──────────────┐  ┌──────────────┐                 │
│  📖 Docs        │     │  │ Acme Corp    │  │ TechStart    │                 │
│  ❓ Help        │     │  │ ● Running    │  │ ○ Stopped    │                 │
│  ⚙️  Settings   │     │  └──────────────┘  └──────────────┘                 │
│                 │     │                                                     │
└─────────────────┘     └─────────────────────────────────────────────────────┘

Sidebar: WebviewView with WelcomeView
Main Panel: ProjectsDashboard (existing component)


STATE 2: Project Selected (Project Detail)
─────────────────────────────────────────────────────────────────────────────────
┌─────────────────┐     ┌─────────────────────────────────────────────────────┐
│  ACME CORP      │     │  ← All Projects                                     │
├─────────────────┤     │                                                     │
│                 │     │  Acme Corp                                          │
│  📁 Next.js     │     │  ═══════════════════════════════════════════        │
│    └─ src/      │     │                                                     │
│    └─ pages/    │     │  ● Running on port 3000                             │
│                 │     │                                                     │
│  📁 Commerce    │     │  [▶ Start]  [■ Stop]  [🌐 Open Browser]             │
│    └─ app/      │     │                                                     │
│                 │     │  ─────────────────────────────────────────────      │
│  📁 API Mesh    │     │                                                     │
│    └─ mesh.json │     │  [⚙️ Configure]  [🔄 Check Updates]                 │
│                 │     │                                                     │
└─────────────────┘     └─────────────────────────────────────────────────────┘

Sidebar: TreeView with dynamic title (project name) showing component files
Main Panel: Project Dashboard (existing, with new "← All Projects" nav)


STATE 3: Wizard (Creating New Project)
─────────────────────────────────────────────────────────────────────────────────
┌─────────────────┐     ┌─────────────────────────────────────────────────────┐
│  DEMO BUILDER   │     │  Sign In to Adobe                                   │
├─────────────────┤     │  ═══════════════                                    │
│                 │     │                                                     │
│  Setup Progress │     │  ...wizard content...                               │
│  ─────────────  │     │                                                     │
│  ● Sign In      │     │                                        [Continue]   │
│  ○ Project      │     │                                        [Cancel]     │
│  ...            │     │                                                     │
│                 │     │                                                     │
└─────────────────┘     └─────────────────────────────────────────────────────┘

Sidebar: WebviewView with wizard timeline (existing)
Main Panel: Wizard (existing)
```

## Navigation Flow

```
                    ┌──────────────────┐
                    │  Extension       │
                    │  Activates       │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Has Projects?   │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │ Yes                         │ No
              ▼                             ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  Projects List   │          │  Empty State     │
    │  (home screen)   │          │  with CTA        │
    └────────┬─────────┘          └────────┬─────────┘
             │                             │
             │ Click Card                  │ Click "+ New Demo"
             ▼                             ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  Project Detail  │◀─────────│     Wizard       │
    │  + Component     │ Complete │                  │
    │    TreeView      │          └────────┬─────────┘
    └────────┬─────────┘                   │
             │                             │ Cancel
             │ "← All Projects"            │
             ▼                             ▼
    ┌──────────────────────────────────────────────┐
    │              Projects List                    │
    └──────────────────────────────────────────────┘
```

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

### Main Panel Commands

| Command | Shows |
|---------|-------|
| `demoBuilder.showProjectsList` | Projects List (home) |
| `demoBuilder.showProjectDashboard` | Project Detail |
| `demoBuilder.createProject` | Wizard |

---

## Implementation Steps

### Phase 1: Projects List as Home Screen

**Step 1.1: Create ProjectsListWebviewCommand**

Create a new webview command that shows the Projects List as the main panel.

**Files:**
- `src/features/projects-dashboard/commands/showProjectsList.ts` (new)
- `src/features/projects-dashboard/ui/index.tsx` (update entry point)

**Test Strategy:**
- Unit test: Command creates panel with correct ID
- Unit test: Handler returns all projects
- Integration test: Clicking "+ New" triggers wizard

**Step 1.2: Wire up extension activation**

When extension activates:
- If projects exist → show Projects List
- If no projects → show Projects List with empty state

**Files:**
- `src/extension.ts` (update activation)
- `src/commands/commandManager.ts` (register new command)

**Test Strategy:**
- Unit test: Activation shows Projects List when projects exist
- Unit test: Activation shows empty state when no projects

---

### Phase 2: Card Click → Project Detail

**Step 2.1: Add card click handler**

When user clicks a project card:
1. Load project into state
2. Navigate to Project Detail
3. Update sidebar context

**Files:**
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` (update)
- `src/features/dashboard/commands/showDashboard.ts` (ensure it works standalone)

**Test Strategy:**
- Unit test: Click handler calls selectProject with correct path
- Unit test: selectProject loads project and triggers navigation
- Integration test: Card click → Project Detail shown

**Step 2.2: Add "← All Projects" navigation**

Add back navigation from Project Detail to Projects List.

**Files:**
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx` (add nav link)
- `src/features/dashboard/handlers/dashboardHandlers.ts` (add handler)

**Test Strategy:**
- Unit test: Back link renders
- Unit test: Click handler triggers navigation
- Integration test: Back → Projects List shown, sidebar updates

---

### Phase 3: Component TreeView Sidebar

**Step 3.1: Register TreeView in package.json**

Add the component TreeView alongside the existing WebviewView sidebar.

**Files:**
- `package.json` (add view with `when` clause)

**Step 3.2: Wire up ComponentTreeProvider**

Connect the existing ComponentTreeProvider to the new TreeView.

**Files:**
- `src/extension.ts` (register TreeView)
- `src/features/components/providers/componentTreeProvider.ts` (verify/update)

**Step 3.3: Dynamic TreeView title**

Set TreeView title to project name when project is loaded.

**Files:**
- `src/extension.ts` or dedicated manager

**Test Strategy:**
- Unit test: TreeView shows when project loaded
- Unit test: TreeView title matches project name
- Unit test: TreeView hidden when no project or wizard active

---

### Phase 4: Context Variables & View Switching

**Step 4.1: Set context variables**

Update VS Code context when state changes.

**Files:**
- `src/core/state/stateManager.ts` (add context updates)
- `src/features/project-creation/commands/createProject.ts` (set wizardActive)

**Commands:**
```typescript
vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', true);
vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', false);
```

**Step 4.2: Verify view switching**

Ensure sidebar views show/hide correctly based on context.

**Test Strategy:**
- Integration test: No project → WebviewView shown
- Integration test: Project loaded → TreeView shown
- Integration test: Wizard active → WebviewView shown (timeline)

---

### Phase 5: Polish & Edge Cases

**Step 5.1: Wizard completion flow**

After wizard completes:
1. Load new project
2. Navigate to Project Detail
3. Sidebar shows Component TreeView

**Step 5.2: Wizard cancellation flow**

After wizard cancelled:
1. Navigate to Projects List
2. Sidebar shows WelcomeView

**Step 5.3: Handle edge cases**

- Project deleted while viewing → return to Projects List
- Last project deleted → show empty state
- Extension reactivates with project in state → show Project Detail

---

## Existing Components to Reuse

| Component | Location | Usage |
|-----------|----------|-------|
| `ProjectsDashboard` | `src/features/projects-dashboard/ui/` | Projects List view |
| `ProjectCard` | `src/features/projects-dashboard/ui/components/` | Card in grid |
| `ProjectsGrid` | `src/features/projects-dashboard/ui/components/` | Grid layout |
| `DashboardEmptyState` | `src/features/projects-dashboard/ui/components/` | Empty state |
| `ComponentTreeProvider` | `src/features/components/providers/` | Component browser |
| `ProjectDashboardScreen` | `src/features/dashboard/ui/` | Project Detail |
| `WelcomeView` | `src/features/sidebar/ui/views/` | Sidebar welcome |
| `TimelineNav` | `src/core/ui/components/` | Wizard progress |

## Files to Create

| File | Purpose |
|------|---------|
| `src/features/projects-dashboard/commands/showProjectsList.ts` | Projects List command |

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add TreeView, context `when` clauses |
| `src/extension.ts` | Register TreeView, activation logic |
| `src/commands/commandManager.ts` | Register new command |
| `src/features/dashboard/ui/ProjectDashboardScreen.tsx` | Add "← All Projects" |
| `src/core/state/stateManager.ts` | Set context variables |

---

## Success Criteria

- [ ] Extension activates → Projects List shown (if projects exist)
- [ ] Empty state shown when no projects
- [ ] Click project card → Project Detail shown
- [ ] Sidebar shows Component TreeView with project name as title
- [ ] "← All Projects" returns to Projects List
- [ ] Wizard completion → Project Detail
- [ ] Wizard cancellation → Projects List
- [ ] All existing tests pass
- [ ] New tests for navigation flow

---

## Open Questions

1. **Should Projects List be a separate webview or reuse Welcome webview?**
   - Recommendation: Separate webview for clear separation of concerns

2. **Should we show a "current project" indicator in Projects List?**
   - Could highlight the card of the currently loaded project
   - Useful if user navigates back just to check other projects

3. **TreeView vs WebviewView for component browser?**
   - TreeView: Native VS Code feel, better performance, built-in expand/collapse
   - WebviewView: More styling control, consistent with rest of UI
   - Recommendation: TreeView (reuse existing ComponentTreeProvider)
