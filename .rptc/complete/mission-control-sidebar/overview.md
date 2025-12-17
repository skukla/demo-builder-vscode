# Projects Dashboard Architecture

## Summary

Replace the current TreeView sidebar + Welcome Screen with a **Projects Dashboard** model - a proper app experience where users see their projects first, with a minimal sidebar for navigation.

## Branch

```
Branch: feature/projects-dashboard-architecture
Base: release/v1.0.0-beta.73
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary screen | Projects Dashboard | Standard pattern for project management apps |
| Sidebar role | Minimal navigation | Keeps rich content in main area where there's room |
| Welcome Screen | Eliminated | Dashboard empty state serves this purpose |
| Wizard Welcome step | Removed | Dashboard CTA replaces it |
| Default view | Always Projects Dashboard | Consistent entry point |
| Project filtering | SearchableList component | Reuse existing pattern |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER CLICKS ICON                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   PROJECTS DASHBOARD                         │
│   (Main Area: Project cards grid OR empty state with CTA)   │
│   (Sidebar: Navigation - Projects, Docs, Help)              │
└─────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌──────────────────────┐           ┌──────────────────────────┐
│  Click Project Card  │           │  Click "+ New Demo"      │
└──────────────────────┘           └──────────────────────────┘
          │                                    │
          ▼                                    ▼
┌──────────────────────┐           ┌──────────────────────────┐
│   PROJECT DETAIL     │           │       WIZARD             │
│   (Status, Controls) │           │   (Step-by-step flow)    │
└──────────────────────┘           └──────────────────────────┘
```

## Development Guidelines

### 1. Reuse Existing Components

| Component | Location | Usage |
|-----------|----------|-------|
| `SearchableList` | `@/core/ui/components/navigation/` | Project filtering |
| `StatusDot` | `@/core/ui/components/ui/` | Running/stopped indicator |
| `Spinner` | `@/core/ui/components/ui/` | Loading states |
| `WebviewApp` | `@/core/ui/components/` | Root wrapper with handshake |
| `WebviewClient` | `@/core/ui/utils/` | Extension communication |
| `EmptyState` | `@/core/ui/components/feedback/` | Empty state display |
| `StatusDisplay` | `@/core/ui/components/feedback/` | Status messages |

### 2. New Components to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| `ProjectCard` | `src/features/projects-dashboard/ui/components/` | Project tile |
| `ProjectsGrid` | `src/features/projects-dashboard/ui/components/` | Card grid layout |
| `SidebarNav` | `src/features/sidebar/ui/components/` | Navigation list |
| `WizardProgress` | `src/features/sidebar/ui/components/` | Step indicators |

### 3. Follow Project SOPs

- **RPTC Workflow:** Research → Plan → TDD → Commit
- **Code Style:** ESLint rules, path aliases (`@/core/*`, `@/features/*`)
- **Testing:** Write tests for new components
- **Documentation:** Update CLAUDE.md files for new features
- **Design System:** Adobe Spectrum components, existing CSS utilities, VS Code theme integration

## File Structure

```
src/features/
├── sidebar/                          # NEW: WebviewView sidebar
│   ├── index.ts
│   ├── providers/
│   │   └── sidebarProvider.ts        # WebviewViewProvider
│   ├── ui/
│   │   ├── index.tsx                 # Entry point
│   │   ├── Sidebar.tsx               # Main container
│   │   └── components/
│   │       ├── SidebarNav.tsx        # Navigation list
│   │       ├── BackButton.tsx        # ← Projects
│   │       └── WizardProgress.tsx    # Step indicators
│   └── handlers/
│       └── sidebarHandlers.ts
│
├── projects-dashboard/               # NEW: Main dashboard
│   ├── index.ts
│   ├── ui/
│   │   ├── index.tsx                 # Entry point
│   │   ├── ProjectsDashboard.tsx     # Main component
│   │   └── components/
│   │       ├── ProjectCard.tsx       # Single card
│   │       ├── ProjectsGrid.tsx      # Card grid
│   │       └── EmptyState.tsx        # Empty view
│   └── handlers/
│       └── dashboardHandlers.ts
│
├── project-detail/                   # RENAME: dashboard → project-detail
│   └── (existing dashboard code)
│
└── project-creation/                 # MODIFY: Remove welcome step
    └── ui/
        └── wizard/
            └── (update step config)
```

## Success Criteria

- [ ] First-time user sees Projects Dashboard with empty state and clear CTA
- [ ] Returning user sees Projects Dashboard with their project cards
- [ ] Search/filter works when > 5 projects
- [ ] Clicking project card navigates to Project Detail
- [ ] Clicking "+ New" opens wizard (no welcome step)
- [ ] Sidebar shows contextual navigation for each screen
- [ ] Back navigation works from all screens
- [ ] Design system compliance (Spectrum, existing CSS utilities)

## Implementation Steps

1. **step-01.md** - Projects Dashboard (Main Area)
2. **step-02.md** - Sidebar WebviewView
3. **step-03.md** - Integration & Cleanup
4. **step-04.md** - Polish
