# Projects Dashboard Architecture - Plan v2

## Overview

Replace the current TreeView sidebar + Welcome Screen with a **Projects Dashboard** model - a proper app experience where users see their projects first, with a minimal sidebar for navigation.

## Core Insight

This is a **project management app**. The natural first screen is a Projects Dashboard showing "here's your stuff" - not a welcome message, not a wizard, not an empty sidebar.

## Architecture

### Screen Inventory

| Screen | Purpose | Main Area Content |
|--------|---------|-------------------|
| **Projects Dashboard** | Home screen | Project cards grid, empty state with CTA |
| **Project Detail** | Single project | Status, controls, components, mesh status |
| **Wizard** | Create new project | Step-by-step creation flow |
| **Configure** | Edit project | Configuration form |

### Sidebar Role (Minimal Navigation)

The sidebar is **navigation only** - minimal and contextual:

```
PROJECTS VIEW          PROJECT VIEW           WIZARD VIEW
─────────────          ────────────           ───────────
🏠 Projects ←          ← Projects             ← Projects

───────────            ACME DEMO              NEW DEMO
📖 Docs                ───────────            ───────────
💬 Help                📊 Overview ←          ✓ Welcome
                       ⚙️ Configure            ● Auth
                       🔄 Updates              ○ Components
                                              ○ Review
```

### Main Area Role (Rich Content)

All meaningful content lives in the main area where there's room:

- Project cards with status, timestamps
- Empty states with clear CTAs
- Wizard step content
- Project dashboards with controls

---

## User Flows

### Flow 1: First-Time User

```
1. Click Demo Builder icon
   ↓
2. Sidebar: 🏠 Projects (selected), Docs, Help
   Main: Projects Dashboard (empty state)

   ┌─────────────────┬───────────────────────────────────┐
   │ 🏠 Projects   ← │  YOUR PROJECTS                    │
   │                 │                                   │
   │ ───────────     │    ┌───────────────────────┐     │
   │ 📖 Docs         │    │                       │     │
   │ 💬 Help         │    │   No projects yet     │     │
   │                 │    │                       │     │
   │                 │    │  [ + Create Demo ]    │     │
   │                 │    │                       │     │
   │                 │    └───────────────────────┘     │
   └─────────────────┴───────────────────────────────────┘

3. Click "Create Demo"
   ↓
4. Sidebar: Shows wizard progress
   Main: Wizard step content

5. Complete wizard
   ↓
6. Sidebar: Project navigation
   Main: Project Detail (newly created project)
```

### Flow 2: Returning User (Has Projects)

```
1. Click Demo Builder icon
   ↓
2. Sidebar: 🏠 Projects (selected)
   Main: Projects Dashboard (shows project cards)

   ┌─────────────────┬───────────────────────────────────┐
   │ 🏠 Projects   ← │  YOUR PROJECTS         [ + New ] │
   │                 │                                   │
   │ ───────────     │  ┌───────────┐  ┌───────────┐   │
   │ 📖 Docs         │  │ Acme Demo │  │ BigCo     │   │
   │ 💬 Help         │  │ ● Running │  │ ○ Stopped │   │
   │                 │  │ 2h ago    │  │ 3d ago    │   │
   │                 │  └───────────┘  └───────────┘   │
   └─────────────────┴───────────────────────────────────┘

3. Click project card
   ↓
4. Sidebar: Project navigation (Overview, Configure, Updates)
   Main: Project Detail

   ┌─────────────────┬───────────────────────────────────┐
   │ ← Projects      │  ACME DEMO                        │
   │                 │                                   │
   │ ACME DEMO       │  ● Running on :3000               │
   │ ───────────     │                                   │
   │ 📊 Overview   ← │  [■ Stop] [↻ Restart] [🌐 Open]  │
   │ ⚙️ Configure    │                                   │
   │ 🔄 Updates      │  Components: Storefront, Mesh     │
   │                 │  Mesh: Deployed ✓                 │
   └─────────────────┴───────────────────────────────────┘
```

### Flow 3: Create Another Project

```
1. From Projects Dashboard, click "+ New"
   ↓
2. Sidebar: Wizard progress
   Main: Wizard step 1

3. Complete wizard
   ↓
4. Return to Project Detail for new project
```

---

## Screen Specifications

### Projects Dashboard

**Purpose:** Home screen - show all projects or empty state

**Empty State:**
- Centered card with friendly message
- "No projects yet"
- Primary CTA: "Create Demo"
- Optional: Link to docs/tutorial

**With Projects:**
- Header: "Your Projects" + "+ New" button
- Grid of project cards (responsive: 2-3 columns)
- Each card shows:
  - Project name
  - Status indicator (● Running / ○ Stopped)
  - Port number (if running)
  - Last modified timestamp
- Click card → Navigate to Project Detail

**Sidebar Context:**
- 🏠 Projects (selected)
- Divider
- 📖 Docs
- 💬 Help

---

### Project Detail

**Purpose:** Single project view - status, controls, information

**Header:**
- Project name
- Status badge (Running/Stopped)
- Port number (if running)

**Controls:**
- Start / Stop / Restart buttons
- Open in Browser button (if running)

**Information Sections:**
- Components list with status
- Mesh deployment status
- Quick links (Configure, Check Updates)

**Sidebar Context:**
- ← Projects (back navigation)
- Project name header
- Divider
- 📊 Overview (selected)
- ⚙️ Configure
- 🔄 Updates

---

### Wizard

**Purpose:** Create new project step-by-step

**Main Area:**
- Current step content (full width)
- Step title and description
- Step-specific form/selection UI
- Back / Continue navigation

**Sidebar Context:**
- ← Projects (cancel/back to dashboard)
- "NEW DEMO" header
- Divider
- Step progress list:
  - ✓ Completed steps (checkmark)
  - ● Current step (filled dot)
  - ○ Future steps (empty dot)

---

### Configure

**Purpose:** Edit project settings

**Main Area:**
- Configuration form
- Save / Cancel actions

**Sidebar Context:**
- Same as Project Detail
- ⚙️ Configure (selected)

---

## File Structure

```
src/features/
├── sidebar/
│   ├── index.ts
│   ├── providers/
│   │   └── sidebarProvider.ts          # WebviewViewProvider
│   ├── ui/
│   │   ├── index.tsx                   # Entry point
│   │   ├── Sidebar.tsx                 # Main container
│   │   └── components/
│   │       ├── NavItem.tsx             # Navigation item
│   │       ├── BackButton.tsx          # ← Projects
│   │       ├── WizardProgress.tsx      # Step indicators
│   │       └── ProjectNav.tsx          # Project sections
│   └── handlers/
│       └── sidebarHandlers.ts
│
├── projects-dashboard/                  # NEW FEATURE
│   ├── index.ts
│   ├── ui/
│   │   ├── index.tsx
│   │   ├── ProjectsDashboard.tsx       # Main dashboard
│   │   └── components/
│   │       ├── ProjectCard.tsx         # Project card
│   │       ├── ProjectsGrid.tsx        # Card grid
│   │       └── EmptyState.tsx          # No projects view
│   └── handlers/
│       └── dashboardHandlers.ts
│
└── dashboard/                           # EXISTING (rename to project-detail?)
    └── ... (existing project dashboard code)
```

---

## Implementation Phases

### Phase 1: Projects Dashboard (Main Area)

1. Create `projects-dashboard` feature
2. Build ProjectsDashboard component
3. Build ProjectCard component
4. Build EmptyState component
5. Wire up to StateManager for project list
6. Add "+ New" button → triggers wizard

### Phase 2: Sidebar WebviewView

1. Create WebviewViewProvider (replacing TreeView)
2. Build minimal navigation UI
3. Implement context-switching (Projects / Project / Wizard)
4. Wire up navigation messages

### Phase 3: Integration

1. Update extension.ts activation flow
2. Remove old Welcome Screen
3. Update wizard to work with new sidebar
4. Update existing Dashboard to work with new sidebar

### Phase 4: Polish

1. Transitions between views
2. Loading states
3. Error states
4. Keyboard navigation

---

## What Gets Eliminated

| Current | Replaced By |
|---------|-------------|
| Welcome Screen | Projects Dashboard (empty state) |
| TreeView sidebar | WebviewView sidebar |
| "Components" tree | Project Detail view |
| Separate welcome step? | Could keep or remove |

---

## Design System Compliance

All components use existing design system:

- **React Spectrum** components
- **Spectrum Icons**
- **Existing CSS utilities** (flex, gap, etc.)
- **VS Code theme integration**
- **WebviewClient** for communication
- **WebviewApp** wrapper

---

## Open Questions

1. **Project cards:** How much info to show? Name + status + timestamp enough?
2. **Running indicator:** Show in dashboard grid, or only in detail view?
3. **Default view:** Always open to Projects Dashboard, or last-viewed project?
4. **Wizard welcome step:** Keep as step 1, or remove since dashboard serves as entry?

---

## Success Metrics

- [ ] First-time user understands what to do within 5 seconds
- [ ] Returning user can find their project within 2 clicks
- [ ] No redundant screens or duplicate CTAs
- [ ] Sidebar never feels useless or confusing
- [ ] Main area always has meaningful content
