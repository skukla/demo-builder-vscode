# Research: Wizard Settings Import/Export

**Date:** 2025-12-12
**Scope:** Hybrid (Codebase + Web Research)
**Depth:** Standard

## Summary

The wizard already has a **preset system** for component selections (`PresetDefinition` in `types/components.ts:150-163`), but it only stores **what** components to use, not the **config values**. The solution is to extend this system to include a `componentConfigs` snapshot, plus add import/export UX. Industry patterns strongly favor JSON files with secret separation via `.env.example`.

---

## Problem Statement

Users find it tedious to re-enter the same settings (component configs, Adobe org/project bindings) when creating new demo projects. They want a way to:

1. **Save settings** from one project creation
2. **Reuse settings** in future project creations
3. **Share settings** with team members (nice-to-have)

---

## Codebase Analysis

### Existing Data Structures

| Structure | Location | What It Holds |
|-----------|----------|---------------|
| `WizardState` | `types/webview.ts:28-68` | Full wizard state (ephemeral) |
| `ComponentSelection` | `types/webview.ts:197-205` | Which components selected |
| `ComponentConfigs` | `types/webview.ts:207-213` | Config values: `Record<componentId, Record<fieldKey, value>>` |
| `PresetDefinition` | `types/components.ts:150-163` | Component selections only (no configs) |
| Project Manifest | `.demo-builder.json` | Full project including `componentConfigs` |

### Existing Preset Handler

- `handleLoadPreset` at `componentHandlers.ts:232-266`
- Loads from `ComponentRegistryManager.getPresets()`
- Returns selections → UI applies them

### Key Insight

The `componentConfigs` structure is **already JSON-serializable** and persisted in `.demo-builder.json`. You just need to:

1. Extract it for export
2. Re-inject it during wizard flow

### Relevant Files

- `src/types/webview.ts:28-68` - WizardState definition
- `src/types/webview.ts:197-213` - ComponentSelection and ComponentConfigs types
- `src/types/components.ts:150-163` - PresetDefinition (extend this)
- `src/features/components/handlers/componentHandlers.ts:232-266` - Existing preset handler
- `src/features/project-creation/ui/wizard/WizardContainer.tsx:105-119` - Wizard state management
- `src/core/state/stateManager.ts:201-221` - Project manifest structure
- `src/features/project-creation/helpers/envFileGenerator.ts:32-130` - Env file generation with secret handling

---

## Implementation Options

### Option A: Extend Preset System (Settings Templates)

**How it works:**
- Extend `PresetDefinition` to include `componentConfigs`
- Store in `templates/presets.json` (or separate user directory)
- User selects preset → both selections AND configs applied

```typescript
interface ExtendedPreset extends PresetDefinition {
  componentConfigs?: ComponentConfigs; // Add this
  adobe?: {
    orgId?: string;
    projectName?: string;
  };
}
```

**Pros:**
- Minimal new code (extends existing system)
- Clear UI: "Choose a preset" in component selection step
- Can ship built-in presets for common scenarios

**Cons:**
- Presets are global, not per-project
- May feel "heavy" for simple config reuse

---

### Option B: Import from Existing Project

**How it works:**
- "Import settings from..." button in wizard
- User selects existing project folder
- Read `.demo-builder.json` → extract `componentConfigs`, `componentSelections`, `adobe`
- Apply to current wizard state

**Pros:**
- Zero extra file management for user
- Natural mental model: "use settings like my other project"
- Already have the data (in manifests)

**Cons:**
- Requires existing project
- Can't share settings with others easily

---

### Option C: Export/Import JSON File

**How it works:**
- Export: Wizard "Save settings..." → `demo-builder-settings.json`
- Import: Wizard "Load settings..." → reads JSON, applies to state
- Separate secrets into `.env.example` pattern

**Export Format:**
```json
{
  "$schema": "https://demo-builder.com/settings-schema.json",
  "version": "1.0",
  "componentSelections": {
    "frontend": "citisignal-nextjs",
    "backend": "adobe-commerce-paas",
    "dependencies": ["commerce-mesh"]
  },
  "componentConfigs": {
    "adobe-commerce": {
      "ADOBE_COMMERCE_URL": "https://demo.example.com"
    },
    "citisignal-nextjs": {
      "NEXT_PUBLIC_SITE_NAME": "Demo Store"
    }
  },
  "adobe": {
    "orgName": "Demo Corp",
    "projectName": "Demo Project"
  }
}
```

**Secret Handling:**
- Filter out fields where `type: 'password'` or key contains `KEY`, `SECRET`, `TOKEN`
- Generate `.env.example` companion showing what secrets are needed

**Pros:**
- Shareable via email, Slack, git
- Self-documenting (can add `$schema`)
- Clear secret separation

**Cons:**
- Extra file to manage
- User must know where they saved it

---

### Option D: Project Template (Full Clone)

**How it works:**
- Export entire project as template
- Import creates new project with all settings pre-filled
- Similar to `degit` or GitHub template repos

**Pros:**
- Complete solution (components + configs + mesh state)
- Great for team onboarding

**Cons:**
- More complex (file copying, path updates)
- Scope creep (mesh redeployment, etc.)

---

## Comparison Matrix

| Criterion | A: Presets | B: From Project | C: JSON File | D: Full Template |
|-----------|------------|-----------------|--------------|------------------|
| Effort to build | Low | Low | Medium | High |
| User file management | None | None | 1 file | Directory |
| Shareable | No | No | Yes | Yes |
| Secret handling | N/A | Auto-filtered | Filtered | Tricky |
| Works without project | Yes | No | Yes | Yes |

---

## Web Research: Best Practices

### Configuration Preset Patterns

1. **ESLint/Prettier `extends` pattern**: Configs inherit from base with overrides
2. **VS Code Profiles**: Export to GitHub Gist or local file, exclude machine-specific settings
3. **Create React App templates**: `--template` flag for custom starters
4. **cosmiconfig**: Multi-format config discovery (JSON, YAML, JS)

### Secret Handling

- **dotenv-safe**: Validates `.env` against `.env.example`
- **GitGuardian**: 15M+ secrets caught in 2023 - never commit secrets
- **Pattern filtering**: Redact `*KEY`, `*SECRET`, `*TOKEN`, `*PASSWORD`

### UX Recommendations

1. **Placement**: Import/Export buttons in wizard header or first step - not buried in menus
2. **Preset selection**: Use card grid or radio buttons for 3-5 presets (not dropdown)
3. **Feedback**: Show what was imported ("Loaded 12 settings from Demo Project")
4. **Validation**: Use JSON Schema for config files

### Sources

- [ESLint Shareable Configs](https://eslint.org/docs/latest/extend/shareable-configs)
- [VS Code Profiles](https://code.visualstudio.com/docs/editor/profiles)
- [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig)
- [dotenv-safe](https://github.com/rolodato/dotenv-safe)
- [GitGuardian .env Security](https://blog.gitguardian.com/secure-your-secrets-with-env/)

---

## Recommended Approach (Hybrid)

### Phase 1: Must Have (Options B + C Combined)

1. Add "Import Settings" button to first wizard step
2. Two sources: "From existing project" OR "From file"
3. Export: "Save Settings" option in Review step (before creation)
4. Secret filtering with `.env.example` generation

### Phase 2: Nice to Have (Option A)

- Built-in presets for common scenarios ("Commerce Only", "Full Stack", "Developer Lite")
- User can save their configs as personal presets

### Phase 3: Future (Option D)

- Full project template export/import
- Team template sharing via git

---

## Files to Modify

| File | Change |
|------|--------|
| `types/components.ts` | Extend `PresetDefinition` with `componentConfigs` |
| `types/webview.ts` | Add `importedFrom?: string` to track source |
| `WizardContainer.tsx` | Add import/export handlers |
| `componentHandlers.ts` | New `handleImportSettings`, `handleExportSettings` |
| First wizard step | Add Import Settings button |
| `ReviewStep.tsx` | Add Export Settings option |
| New: `settingsSerializer.ts` | Handle secret filtering, JSON generation |

---

## Common Pitfalls to Avoid

1. **Don't export secrets**: Filter `type: 'password'` fields and known patterns
2. **Validate on import**: Schema validation catches corrupt/outdated files
3. **Handle missing components**: If imported config references component not selected, skip gracefully
4. **Version the format**: Include `"version": "1.0"` for future compatibility
5. **Show what was applied**: "Imported 8 settings, 3 skipped (not selected)"

---

## Key Takeaways

1. **You already have 80% of the plumbing** - `componentConfigs` is serializable, presets exist
2. **Start with "Import from Project"** - zero new files, immediate value
3. **Add JSON export for sharing** - teams can pass settings around
4. **Always filter secrets** - use the existing `type: 'password'` metadata
5. **Progressive enhancement** - built-in presets and templates are nice-to-haves

---

## Final UX Design Decisions

### User Journey Context

Users land on the **Projects Dashboard** first, not the wizard. The wizard only opens when creating a new project.

```
Projects Dashboard  →  "New" button  →  Wizard  →  Project Dashboard
(entry point)           (trigger)       (setup)    (manage project)
```

---

### Import Entry Points

| Location | Action | When Visible |
|----------|--------|--------------|
| Empty state (no projects) | "New" button + "Import from File" button | First-time users |
| Projects list header | "New" dropdown menu | Returning users with projects |

#### Empty State (No Projects)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                      No projects yet                            │
│                                                                 │
│            Get started by creating your first demo              │
│                                                                 │
│                                                                 │
│                      [ [+] New ]                                │
│                        (accent)                                 │
│                                                                 │
│                ─────────── or ───────────                       │
│                                                                 │
│           [ [Import] Import from File ]  (secondary)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Projects List Header (Has Projects)

"New" button becomes a dropdown menu:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Filter projects...]                          [ [+] New ▾ ]    │
│                                                ┌───────────────┐│
│  ┌──────────┐  ┌──────────┐                    │ New Project   ││
│  │ my-demo  │  │ other    │                    ├───────────────┤│
│  └──────────┘  └──────────┘                    │ Copy from     ││
│                                                │ Existing...   ││
│                                                ├───────────────┤│
│                                                │ Import from   ││
│                                                │ File...       ││
│                                                └───────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Menu items:**
1. **New Project** - Fresh start, opens wizard normally
2. **Copy from Existing...** - Opens VS Code QuickPick, then wizard with pre-filled state
3. **Import from File...** - Opens file browser, then wizard with pre-filled state

---

### Export Entry Points

| Location | Action |
|----------|--------|
| Project card context menu | "Export Settings..." menu item |
| Project dashboard | "Export Settings" action button |

#### Project Card Context Menu

```
┌─────────────────────────┐
│ Open                    │
│ Start Demo              │
├─────────────────────────┤
│ Export Settings...      │
├─────────────────────────┤
│ Delete                  │
└─────────────────────────┘
```

#### Project Dashboard Action

```
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│ Start Demo        │  │ Redeploy Mesh     │  │ Export Settings   │
└───────────────────┘  └───────────────────┘  └───────────────────┘
```

---

### Copy from Existing - VS Code QuickPick

Uses native VS Code QuickPick for project selection:

```
┌─────────────────────────────────────────────────────────────┐
│ Select a project to copy settings from                      │
├─────────────────────────────────────────────────────────────┤
│ > my-commerce-demo                                          │
│   CitiSignal · API Mesh · Demo Corp / Production            │
├─────────────────────────────────────────────────────────────┤
│   test-project                                              │
│   Commerce Only · Demo Corp / Stage                         │
└─────────────────────────────────────────────────────────────┘
```

---

### Post-Import Flow

After importing (from file or existing project):
1. Wizard opens at step 1 (Welcome) with pre-filled state
2. User walks through **all steps** to review and confirm
3. Pre-filled fields are visually indicated
4. Secret/password fields are always empty (user must re-enter)

---

### Import Feedback

**Inline banner** at top of first wizard step:

```
┌───────────────────────────────────────────────────────────┐
│ [Info] Settings imported from my-commerce-demo            │
│        4 components · 12 values · 3 secrets need input    │
│                                            [Dismiss]      │
└───────────────────────────────────────────────────────────┘
```

**Field indicators** on pre-filled fields:
- Subtle visual indicator (e.g., different border or small icon) to show which fields came from import

---

### Secret Handling (Local Operation)

Since the extension operates locally:

| Action | Include Secrets? | Rationale |
|--------|------------------|-----------|
| Copy from Existing | Yes | Same machine, same user - no risk |
| Export to File | User chooses | File might be shared |
| Import from File | Accept as-is | User's responsibility |

#### Export Options Dialog

```
┌───────────────────────────────────────────────────────────────┐
│  Export Settings                                          [×] │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  How would you like to export?                                │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  ( ) Shareable (recommended)                            │ │
│  │      Components, config values, Adobe project           │ │
│  │      Excludes API keys and secrets                      │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │  ( ) Complete (private use only)                        │ │
│  │      Everything including API keys and secrets          │ │
│  │      [AlertCircle] Do not share or commit to git        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│                                  [Cancel]  [Export]           │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

Secret detection uses component registry metadata (`type: 'password'`).

---

### File Format

**Extension:** `.json` (standard JSON with schema pointer)

**Filename pattern:** `{project-name}.demo-builder.json`

**Schema:**

```json
{
  "version": 1,
  "exportedAt": "2025-12-12T10:30:00Z",
  "source": {
    "project": "my-commerce-demo",
    "extension": "1.0.0-beta.82"
  },
  "includesSecrets": false,

  "selections": {
    "frontend": "citisignal-nextjs",
    "backend": "adobe-commerce-paas",
    "dependencies": ["commerce-mesh"],
    "services": ["catalog-service"],
    "integrations": [],
    "appBuilderApps": []
  },

  "configs": {
    "adobe-commerce": {
      "ADOBE_COMMERCE_URL": "https://demo.example.com"
    }
  },

  "adobe": {
    "orgId": "12345@AdobeOrg",
    "orgName": "Demo Corp",
    "projectId": "proj-abc123",
    "projectName": "Demo Project",
    "workspaceId": "ws-xyz789",
    "workspaceName": "Production"
  }
}
```

**Version field:** Simple integer, only increment on breaking schema changes.

---

### Error Handling

Keep it simple - if **we** produce the file, errors should be rare:

| Error | Response |
|-------|----------|
| Not valid JSON | "This file couldn't be read. It may have been corrupted." |
| Missing version / wrong structure | "This doesn't appear to be a Demo Builder settings file." |
| Unknown component ID | Skip silently, user will see empty field in wizard |

No correction workflow needed. User can try a different file or start fresh.

---

### Spectrum Components

| Element | Spectrum Component |
|---------|-------------------|
| New button with menu | `MenuTrigger` + `ActionButton` + `Menu` + `Item` |
| Empty state buttons | `Button` (variant="accent") + `Button` (variant="secondary") |
| Export dialog | VS Code native (QuickPick for options + save dialog) |
| File browser | VS Code native file picker API |
| Project picker | VS Code QuickPick |
| Import feedback banner | Custom component with `InlineAlert` styling |
| Icons | `@spectrum-icons/workflow`: Add, Import, Export, Copy, Alert |

### Design Constraints

- No emoji - use Spectrum icons only
- Follow existing card/button styling patterns
- Use VS Code native dialogs where possible (QuickPick, save/open dialogs)

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| **Export location** | Project card menu + Project dashboard action button |
| **Import location** | Empty state button + "New" dropdown menu |
| **Copy from Existing** | VS Code QuickPick |
| **Post-import flow** | Walk through all wizard steps with pre-filled values |
| **Import feedback** | Inline banner + field indicators |
| **File extension** | `.json` with schema pointer |
| **File naming** | `{project-name}.demo-builder.json` |
| **Version field** | Simple integer (`"version": 1`) |
| **Error handling** | Simple error messages, no correction workflow |
| **Secret detection** | Component registry metadata (`type: 'password'`) |

---

## Next Steps

1. **Plan**: Create detailed implementation plan via `/rptc:plan`
2. **Implement**: TDD workflow for each component
