# Research: Enabling Project Editing Post-Wizard

**Date:** 2025-12-14
**Scope:** Codebase
**Depth:** Standard
**Focus Areas:** Architecture, UI/UX, Data Flow, Reusability

---

## Summary

The codebase has **strong foundational infrastructure** for project editing (state management, settings serialization, wizard components), but the capability to edit existing project selections after creation is not implemented. The gap is primarily in **entry points and orchestration**, not underlying capabilities.

---

## Codebase Analysis

### What Already Exists (Reusable)

| Component | File | Status |
|-----------|------|--------|
| **Project state persistence** | `src/core/state/stateManager.ts` | Ready |
| **Settings import/export** | `src/features/projects-dashboard/services/settingsSerializer.ts` | Ready |
| **Wizard state management** | `src/features/project-creation/ui/wizard/WizardContainer.tsx` | Needs edit mode flag |
| **Configure UI pattern** | `src/features/dashboard/commands/configure.ts` | Ready to extend |
| **Handler patterns** | `src/features/projects-dashboard/handlers/dashboardHandlers.ts` | Ready |

### Current Editing Capabilities

**What CAN be edited** (via Configure screen):
- Environment variables (`.env` files)
- Demo Inspector toggle
- Frontend port
- Advanced config (opens `config.yaml`)

**What CANNOT be edited**:
- Component selections (frontend/backend/dependencies)
- Adobe org/project/workspace bindings
- API Mesh endpoint selection
- Project name

---

## Data Flow

### Current Flow (one-way)

```
Wizard → Create Project → Save to .demo-builder.json → Read-only
```

### Needed Flow (bidirectional)

```
Load Project → Edit Wizard (pre-populated) → Review Changes → Execute Updates → Save
```

### Key Files in Data Flow

| File | Purpose | Lines |
|------|---------|-------|
| `WizardContainer.tsx` | `buildProjectConfig()` serializes wizard state | 63-87 |
| `executor.ts` | Takes config, clones components, saves manifest | 79-100 |
| `stateManager.ts` | Defines manifest structure (`.demo-builder.json`) | 201-227 |

---

## Wizard System Architecture

### WizardState Structure

**Location:** `src/types/webview.ts:28-68`

```typescript
interface WizardState {
    currentStep: WizardStep;
    projectName: string;
    projectTemplate: ProjectTemplate;
    components?: ComponentSelection;           // What components were selected
    componentConfigs?: ComponentConfigs;        // Environment variables for each component
    adobeAuth: AdobeAuthState;
    adobeOrg?: Organization;
    adobeProject?: AdobeProject;
    adobeWorkspace?: Workspace;
    apiMesh?: { meshId, endpoint, meshStatus }; // Mesh configuration
    creationProgress?: CreationProgress;
    // Caches for backward navigation
    projectsCache?: AdobeProject[];
    workspacesCache?: Workspace[];
    organizationsCache?: Organization[];
}
```

### Project Manifest Structure

**Location:** `.demo-builder.json` in project directory

```json
{
    "name": "string",
    "version": "1.0.0",
    "created": "ISO date",
    "lastModified": "ISO date",
    "adobe": { "projectId", "organization", "workspace", "..." },
    "commerce": { "type", "instance", "services" },
    "componentSelections": { "frontend", "backend", "dependencies", "..." },
    "componentInstances": { "componentId": { "path", "status", "version", "..." } },
    "componentConfigs": { "componentId": { "ENV_VAR": "value" } },
    "componentVersions": { "componentId": { "version", "lastUpdated" } },
    "meshState": { "envVars", "sourceHash", "lastDeployed", "..." }
}
```

---

## Implementation Options

### Option A: Quick Config Edit (Minimal)

**Scope:** Edit component configs only, no re-selection
**Effort:** 1-2 days

**Implementation:**
- Extend existing ConfigureProjectWebviewCommand
- Add handlers for toggling components on/off
- Changes persist directly via StateManager

**Pros:**
- Fast to implement
- Low risk
- Immediate user value

**Cons:**
- Cannot change which components are installed

---

### Option B: Import-Based Edit (Medium)

**Scope:** Export settings → modify → import as new project
**Effort:** 2-4 days

**Implementation:**
- Add "Export Settings" button to dashboard
- User exports, modifies JSON, imports in new wizard
- Wizard pre-populates with modified selections

**Pros:**
- Reuses existing import infrastructure (`settingsSerializer.ts`)
- Lower complexity than full edit mode

**Cons:**
- Creates new project, doesn't modify in-place

---

### Option C: True Edit Mode (Full)

**Scope:** Full in-place editing with component replacement
**Effort:** 1-2 weeks

**New components needed:**

1. **`demoBuilder.editProject` command** - Entry point
2. **Edit mode `WizardContainer`** - Load existing selections, allow changes
3. **Diff viewer in review step** - Show what changed
4. **Component replacement executor** - Install new, uninstall old
5. **Rollback/snapshot logic** - Safety net

**Pros:**
- Complete solution
- Best UX

**Cons:**
- Most complex
- Needs careful state management

---

## Technical Challenges

| Challenge | Mitigation |
|-----------|-----------|
| **Component conflicts during replacement** | Stop demo before changes; snapshot for rollback |
| **Adobe context changes invalidate mesh** | Validate context unchanged; require re-deployment |
| **Running demo during edit** | Detect running state; require stop first |
| **Concurrent edits** | Use `ExternalCommandManager` locking pattern |

---

## Reusable Components

### 1. WizardContainer

**File:** `src/features/project-creation/ui/wizard/WizardContainer.tsx:114-778`

- Already handles state, navigation, step rendering
- **Needs:** `editMode` flag, initial data from existing project

### 2. SettingsSerializer

**File:** `src/features/projects-dashboard/services/settingsSerializer.ts:1-161`

- `extractSettingsFromProject()` - Get current selections
- `parseSettingsFile()` - Validate imported settings
- **Could add:** diff detection between old/new

### 3. ConfigureProjectWebviewCommand

**File:** `src/features/dashboard/commands/configure.ts:33-200`

- Full webview lifecycle pattern
- **Can extend:** Add edit handlers alongside config handlers

### 4. Dashboard Handlers

**File:** `src/features/projects-dashboard/handlers/dashboardHandlers.ts:31-64`

- Message → Handler → Save pattern
- **Apply to:** Edit mode actions

---

## Gaps to Fill

| Component | Status | Purpose |
|-----------|--------|---------|
| **Edit Wizard Entry Point** | Missing | Command to open wizard in "edit mode" |
| **Edit Mode Wizard UI** | Missing | Variant that allows changing selections |
| **Edit Dashboard Action** | Missing | Button in dashboard to enter edit mode |
| **Re-validation Logic** | Missing | Prerequisites must be re-checked when selections change |
| **Component Replacement** | Missing | Logic to uninstall old and install new components |
| **Diff/Comparison UI** | Partial | No UI to show "what changed" during edit |
| **Atomic Updates** | Missing | Rollback logic if component installation fails mid-edit |

---

## Recommended Approach

### Phased Implementation

**Phase 1 (Quick Win):** Option A - Config edit only
- Extend Configure command with component toggle handlers
- Immediate user value, establishes pattern
- Effort: 1-2 days

**Phase 2 (Medium):** Option B - Import-based workflow
- Add export to dashboard, enhance import in wizard
- Reuses existing serialization infrastructure
- Effort: 2-4 days

**Phase 3 (Full):** Option C - True edit mode
- New command + wizard variant
- Component replacement executor
- Diff viewer in review
- Effort: 1-2 weeks

---

## Key Takeaways

1. **Infrastructure exists** - State management, serialization, wizard patterns are ready
2. **Gap is orchestration** - Need entry points and edit-mode logic, not new foundations
3. **Import/export is underutilized** - Could enable editing workflow today with minor changes
4. **Start small** - Config editing is 1-2 days; full edit mode is 1-2 weeks
5. **Safety first** - Component replacement needs snapshot/rollback (pattern exists in `componentUpdater.ts`)

---

## Key Files Reference

### Extension-Side (Backend)

| File | Purpose |
|------|---------|
| `src/core/state/stateManager.ts` | Project persistence layer |
| `src/features/project-creation/ui/wizard/WizardContainer.tsx` | Main wizard orchestrator |
| `src/features/projects-dashboard/services/settingsSerializer.ts` | Import/export serialization |
| `src/features/dashboard/commands/configure.ts` | Configure webview command |
| `src/features/project-creation/handlers/executor.ts` | Project creation logic |
| `src/features/projects-dashboard/handlers/dashboardHandlers.ts` | Message handlers pattern |
| `templates/wizard-steps.json` | Step configuration |

### Type Definitions

| File | Purpose |
|------|---------|
| `src/types/base.ts:13-56` | Project interface definition |
| `src/types/webview.ts:28-68` | WizardState interface |
| `src/features/projects-dashboard/types/settingsFile.ts` | Import/export schema |
