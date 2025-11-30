# Projects Dashboard Architecture - Final Plan

## Executive Summary

Replace the current TreeView sidebar + Welcome Screen with a **Projects Dashboard** model. This creates a proper app experience where users see their projects first, with a minimal sidebar for navigation.

## Branch

**This is a major refactor. All work must be done on a dedicated feature branch.**

```
Branch: feature/projects-dashboard-architecture
Base: release/v1.0.0-beta.73
```

Create branch before starting implementation:
```bash
git checkout release/v1.0.0-beta.73
git checkout -b feature/projects-dashboard-architecture
```

## Development Guidelines

**This implementation must follow project SOPs and leverage existing infrastructure.**

### 1. Reuse Existing Components

Before creating new components, check for existing ones in:
- `src/core/ui/components/` - Shared UI components
- `src/core/ui/utils/` - Utilities (WebviewClient, spectrumTokens)
- `src/core/ui/styles/` - CSS utilities and theme integration

**Components to reuse:**
| Component | Location | Usage |
|-----------|----------|-------|
| `SearchableList` | `@/core/ui/components/navigation/` | Project filtering |
| `StatusDot` | `@/core/ui/components/ui/` | Running/stopped indicator |
| `Spinner` | `@/core/ui/components/ui/` | Loading states |
| `WebviewApp` | `@/core/ui/components/` | Root wrapper with handshake |
| `WebviewClient` | `@/core/ui/utils/` | Extension communication |
| `EmptyState` | `@/core/ui/components/feedback/` | Empty state display |
| `StatusDisplay` | `@/core/ui/components/feedback/` | Status messages |

### 2. Create New Components Only When Necessary

New components should:
- Follow existing patterns in `src/core/ui/components/`
- Use React Spectrum components as building blocks
- Use existing CSS utility classes from `custom-spectrum.css`
- Include proper TypeScript types
- Be placed in appropriate feature directory

**New components required:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `ProjectCard` | `src/features/projects-dashboard/ui/components/` | Project tile |
| `ProjectsGrid` | `src/features/projects-dashboard/ui/components/` | Card grid layout |
| `SidebarNav` | `src/features/sidebar/ui/components/` | Navigation list |
| `WizardProgress` | `src/features/sidebar/ui/components/` | Step indicators |

### 3. Follow Project SOPs

All implementation must adhere to:
- **RPTC Workflow:** Research → Plan → TDD → Commit
- **Code Style:** ESLint rules, path aliases (`@/core/*`, `@/features/*`)
- **Testing:** Write tests for new components
- **Documentation:** Update CLAUDE.md files for new features
- **Design System:** Adobe Spectrum components, existing CSS utilities, VS Code theme integration
- **Communication Protocol:** Use WebviewClient handshake pattern
- **Error Handling:** Follow existing error handling patterns

**Reference SOPs in:** `.rptc/sops/`

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary screen | Projects Dashboard | Standard pattern for project management apps |
| Sidebar role | Minimal navigation | Keeps rich content in main area where there's room |
| Welcome Screen | Eliminated | Dashboard empty state serves this purpose |
| Wizard Welcome step | Removed | Dashboard CTA replaces it |
| Default view | Always Projects Dashboard | Consistent entry point |
| Project filtering | SearchableList component | Reuse existing pattern |

---

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

---

## Screen Specifications

### Screen 1: Projects Dashboard

**Purpose:** Home screen - the entry point for all users

#### Layout

```
┌─────────────────┬───────────────────────────────────────────┐
│ SIDEBAR         │  YOUR PROJECTS                   [ + New ]│
│ ─────────────── │  ─────────────────────────────────────    │
│                 │                                           │
│ 🏠 Projects   ← │  ┌─ Search ─────────────────────────┐    │
│                 │  │ 🔍 Filter projects...            │    │
│ ───────────     │  └──────────────────────────────────┘    │
│ 📖 Docs         │                                           │
│ 💬 Help         │  ┌─────────────┐  ┌─────────────┐        │
│                 │  │ Acme Demo   │  │ BigCo Store │        │
│                 │  │ ● Running   │  │ ○ Stopped   │        │
│                 │  │ :3000       │  │             │        │
│                 │  └─────────────┘  └─────────────┘        │
│                 │                                           │
│                 │  ┌─────────────┐                          │
│                 │  │ Test Store  │                          │
│                 │  │ ○ Stopped   │                          │
│                 │  └─────────────┘                          │
└─────────────────┴───────────────────────────────────────────┘
```

#### Empty State (First-Time User)

```
┌─────────────────┬───────────────────────────────────────────┐
│ SIDEBAR         │  YOUR PROJECTS                            │
│ ─────────────── │  ─────────────────────────────────────    │
│                 │                                           │
│ 🏠 Projects   ← │                                           │
│                 │       ┌───────────────────────────┐       │
│ ───────────     │       │                           │       │
│ 📖 Docs         │       │     No projects yet       │       │
│ 💬 Help         │       │                           │       │
│                 │       │   [ + Create Demo ]       │       │
│                 │       │                           │       │
│                 │       └───────────────────────────┘       │
│                 │                                           │
└─────────────────┴───────────────────────────────────────────┘
```

#### Project Card Content

Based on the `Project` interface, each card shows:

| Field | Source | Display |
|-------|--------|---------|
| **Name** | `project.name` | Card title |
| **Status** | `project.status` | ● Running / ○ Stopped |
| **Port** | `componentInstances[frontend].port` | `:3000` (only if running) |
| **Components** | `componentInstances` | Stacked list or count + toggle |

**Component Display Options (decide during implementation):**

Option A - Compact Stacked List (if card height feels balanced):
```
┌─────────────────────────────┐
│ Acme Demo                   │
│ ● Running :3000             │
│ ─────────────────────────── │
│ CitiSignal                  │
│ API Mesh                    │
│ Demo Inspector              │
└─────────────────────────────┘
Height: ~130-140px
```

Option B - Count + Toggle (if cards feel too tall):
```
Default:                        Expanded:
┌─────────────────────────────┐ ┌─────────────────────────────┐
│ Acme Demo                   │ │ Acme Demo                   │
│ ● Running :3000             │ │ ● Running :3000             │
│ 3 components ▶              │ │ 3 components ▼              │
└─────────────────────────────┘ │  • CitiSignal               │
Height: ~80-90px                │  • API Mesh                 │
                                │  • Demo Inspector           │
                                └─────────────────────────────┘
```

**Decision Criteria:**
- If most users have <5 projects → Option A (all info visible)
- If users may have many projects → Option B (more cards visible in grid)
- Test both during implementation and choose based on visual balance

**What we intentionally omit:**
- Organization name (available but adds clutter)
- Mesh deployment status (can see in detail view)
- Last modified (available but not essential at glance)

**Rationale:** Card answers two questions: "What's the status?" and "What's in this demo?"

#### Search/Filter

Reuse the existing `SearchableList` component pattern:
- Search field appears when > 5 projects
- Filter by project name
- "Showing X of Y projects" count
- Refresh button

---

### Screen 2: Project Detail

**Purpose:** Single project view - status, controls, information

#### Layout

```
┌─────────────────┬───────────────────────────────────────────┐
│ SIDEBAR         │  ACME DEMO                                │
│ ─────────────── │  ─────────────────────────────────────    │
│                 │                                           │
│ ← Projects      │  Status: ● Running on localhost:3000      │
│                 │                                           │
│ ACME DEMO       │  ┌─────────────────────────────────────┐  │
│ ───────────     │  │ [■ Stop]  [↻ Restart]  [🌐 Open]   │  │
│ 📊 Overview   ← │  └─────────────────────────────────────┘  │
│ ⚙️ Configure    │                                           │
│ 🔄 Updates      │  ─────────────────────────────────────    │
│                 │  Components                               │
│                 │  ✓ Storefront (citisignal-nextjs)         │
│                 │  ✓ API Mesh (Deployed)                    │
│                 │  ✓ Demo Inspector                         │
│                 │                                           │
│                 │  ─────────────────────────────────────    │
│                 │  Adobe I/O                                │
│                 │  Org: My Organization                     │
│                 │  Project: My Project                      │
│                 │  Workspace: Production                    │
└─────────────────┴───────────────────────────────────────────┘
```

#### Sidebar Navigation

| Item | Action |
|------|--------|
| ← Projects | Back to Projects Dashboard |
| 📊 Overview | Current view (project detail) |
| ⚙️ Configure | Opens Configure screen |
| 🔄 Updates | Checks for component updates |

---

### Screen 3: Wizard

**Purpose:** Create new project step-by-step

#### Layout

```
┌─────────────────┬───────────────────────────────────────────┐
│ SIDEBAR         │  STEP 2: SELECT PROJECT                   │
│ ─────────────── │  ─────────────────────────────────────    │
│                 │                                           │
│ ← Cancel        │  Choose an Adobe I/O project to use       │
│                 │  for this demo.                           │
│ NEW DEMO        │                                           │
│ ───────────     │  ┌─────────────────────────────────────┐  │
│ ✓ Sign In       │  │  ○ Project Alpha                    │  │
│ ● Project     ← │  │  ○ Project Beta                     │  │
│ ○ Workspace     │  │  ● Project Gamma (selected)         │  │
│ ○ Components    │  └─────────────────────────────────────┘  │
│ ○ API Mesh      │                                           │
│ ○ Review        │  ─────────────────────────────────────    │
│                 │  [Back]                      [Continue]   │
└─────────────────┴───────────────────────────────────────────┘
```

#### Wizard Steps (Revised - No Welcome Step)

| Step | Name | Content |
|------|------|---------|
| 1 | Sign In | Adobe authentication |
| 2 | Project | Select Adobe I/O project |
| 3 | Workspace | Select workspace |
| 4 | Components | Choose components |
| 5 | API Mesh | Configure mesh (if applicable) |
| 6 | Review | Review and create |

**Note:** Welcome step removed. Dashboard CTA serves as the entry point.

#### Sidebar Progress Indicators

```
✓ = Completed (checkmark, muted color)
● = Current (filled dot, accent color)
○ = Future (empty dot, muted color)
```

---

### Screen 4: Configure

**Purpose:** Edit project settings (existing screen, minimal changes)

Uses same sidebar as Project Detail with "Configure" highlighted.

---

## Eliminated Screens

| Screen | Replacement |
|--------|-------------|
| **Welcome Screen** | Projects Dashboard empty state |
| **Wizard Welcome Step** | Projects Dashboard CTA |
| **TreeView Sidebar** | WebviewView Sidebar |

---

## Component Reuse

### Existing Components to Reuse

| Component | Location | Usage |
|-----------|----------|-------|
| `SearchableList` | `@/core/ui/components/navigation/` | Project filtering |
| `StatusDot` | `@/core/ui/components/ui/` | Running/stopped indicator |
| `Spinner` | `@/core/ui/components/ui/` | Loading states |
| `Button` | React Spectrum | All CTAs |
| `WebviewApp` | `@/core/ui/components/` | Root wrapper |
| `WebviewClient` | `@/core/ui/utils/` | Communication |

### New Components to Create

| Component | Purpose |
|-----------|---------|
| `ProjectCard` | Project tile for grid display |
| `ProjectsGrid` | Responsive grid of project cards |
| `EmptyState` | "No projects" state with CTA |
| `SidebarNav` | Navigation list for sidebar |
| `WizardProgress` | Step indicators for wizard |

---

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

---

## State Management

### Data Flow

```
StateManager
    │
    ├── getAllProjects() → ProjectsDashboard (card grid)
    │
    ├── getCurrentProject() → ProjectDetail (status, controls)
    │
    └── onProjectChanged → Sidebar (updates nav context)
```

### Sidebar Context States

```typescript
type SidebarContext =
    | { type: 'projects' }                           // Projects Dashboard
    | { type: 'project'; project: Project }          // Project Detail
    | { type: 'wizard'; step: number; total: number } // Wizard
    | { type: 'configure'; project: Project };       // Configure
```

---

## Implementation Phases

### Phase 1: Projects Dashboard (Main Area)
**Effort: 6-8 hours**

1. Create `projects-dashboard` feature directory
2. Create `ProjectsDashboard.tsx` component
3. Create `ProjectCard.tsx` component
4. Create `ProjectsGrid.tsx` with responsive layout
5. Create `EmptyState.tsx` component
6. Integrate `SearchableList` pattern for filtering
7. Wire up StateManager for project list
8. Add "+ New" button triggering wizard
9. Add project card click → navigate to detail

### Phase 2: Sidebar WebviewView
**Effort: 4-6 hours**

1. Create `sidebar` feature directory
2. Create `SidebarProvider` (WebviewViewProvider)
3. Create `Sidebar.tsx` main component
4. Create `SidebarNav.tsx` for navigation items
5. Create `BackButton.tsx` component
6. Create `WizardProgress.tsx` for step indicators
7. Implement context switching logic
8. Update `package.json` to use `type: "webview"`

### Phase 3: Integration & Cleanup
**Effort: 4-6 hours**

1. Update `extension.ts` activation flow
2. Remove Welcome Screen webview
3. Remove Welcome step from wizard
4. Rename `dashboard` feature to `project-detail`
5. Update all navigation commands
6. Update webpack config with new entry points
7. Remove old `componentTreeProvider.ts`

### Phase 4: Polish
**Effort: 2-4 hours**

1. Loading states for all views
2. Error states and recovery
3. Keyboard navigation
4. Focus management
5. Transitions between views

**Total Estimated Effort: 16-24 hours**

---

## package.json Changes

### Before

```json
"views": {
  "demoBuilder": [
    {
      "id": "demoBuilder.components",
      "name": "Components"
    }
  ]
}
```

### After

```json
"views": {
  "demoBuilder": [
    {
      "id": "demoBuilder.sidebar",
      "name": "Demo Builder",
      "type": "webview"
    }
  ]
}
```

---

## Webpack Configuration

### New Entry Points

```javascript
entry: {
    wizard: './src/features/project-creation/ui/wizard/index.tsx',
    projectsDashboard: './src/features/projects-dashboard/ui/index.tsx',  // NEW
    projectDetail: './src/features/project-detail/ui/index.tsx',          // RENAMED
    configure: './webview-ui/src/configure/index.tsx',
    sidebar: './src/features/sidebar/ui/index.tsx'                        // NEW
}
```

### Removed Entry Points

```javascript
// REMOVE
welcome: './webview-ui/src/welcome/index.tsx'
```

---

## Migration Checklist

### Files to Create
- [ ] `src/features/sidebar/` (entire directory)
- [ ] `src/features/projects-dashboard/` (entire directory)

### Files to Modify
- [ ] `package.json` (views configuration)
- [ ] `webpack.config.js` (entry points)
- [ ] `src/extension.ts` (activation flow)
- [ ] `src/features/project-creation/ui/wizard/` (remove welcome step)

### Files to Delete
- [ ] `webview-ui/src/welcome/` (entire directory)
- [ ] `src/features/components/providers/componentTreeProvider.ts`

### Files to Rename
- [ ] `src/features/dashboard/` → `src/features/project-detail/`

---

## Success Criteria

- [ ] First-time user sees Projects Dashboard with empty state and clear CTA
- [ ] Returning user sees Projects Dashboard with their project cards
- [ ] Search/filter works when > 5 projects
- [ ] Clicking project card navigates to Project Detail
- [ ] Clicking "+ New" opens wizard (no welcome step)
- [ ] Sidebar shows contextual navigation for each screen
- [ ] Back navigation works from all screens
- [ ] No redundant screens or duplicate CTAs
- [ ] Design system compliance (Spectrum, existing CSS utilities)

---

## Open Items (Post-Implementation)

1. **Analytics:** Track which features users access most
2. **Keyboard shortcuts:** Add shortcuts for common actions
3. **Project thumbnails:** Consider adding visual previews in future
4. **Bulk actions:** Multi-select for stopping multiple demos

---

## Appendix: Project Interface Reference

From `src/types/base.ts`:

```typescript
interface Project {
    name: string;                    // ✓ Used in card
    status: ProjectStatus;           // ✓ Used in card (running/stopped)
    path: string;
    created: Date;
    lastModified: Date;
    organization?: string;
    adobe?: AdobeConfig;
    commerce?: CommerceConfig;
    componentInstances?: Record<string, ComponentInstance>;  // ✓ Port from frontend
    componentSelections?: {...};
    componentConfigs?: {...};
    meshState?: {...};
    // ... other fields
}

type ProjectStatus =
    | 'created' | 'configuring' | 'ready'
    | 'starting' | 'running' | 'stopping' | 'stopped'
    | 'error';
```

**Card displays:**
- `name` → Title
- `status` → Running indicator (● Running / ○ Stopped)
- `componentInstances[frontend].port` → Port number (if running)
- `componentInstances` → Stacked list or count + toggle (decide during implementation)
