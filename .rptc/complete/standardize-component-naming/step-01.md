# Step 1: Standardize Component Naming to "integrations"

## Objective
Rename all instances of `externalSystems` to `integrations` throughout the codebase to align with JSON configuration naming.

## Current State

### JSON Configuration (Already Correct)
`templates/components.json`:
```json
{
  "selectionGroups": {
    "integrations": ["experience-platform", "target"]
  }
}
```

### TypeScript Types (Needs Update)
`src/types/components.ts`:
```typescript
// CURRENT (inconsistent)
interface ComponentRegistry {
    components: {
        externalSystems?: TransformedComponentDefinition[];
    };
}

interface ComponentSelection {
    externalSystems?: string[];
}
```

### Backend Code (Needs Update)
`ComponentRegistryManager.ts`:
```typescript
// CURRENT (mapping between names)
(groups.integrations || []).forEach((id: string) => {
    if (enhanced) components.externalSystems.push(enhanced);
});
```

### Frontend Code (Needs Update)
`ComponentSelectionStep.tsx`:
```typescript
// CURRENT
const [selectedExternalSystems, setSelectedExternalSystems] = useState<Set<string>>();
```

## Implementation Plan

### Phase 1: Update Type Definitions

**File: `src/types/components.ts`**

**Change 1 - RawComponentRegistry selectionGroups**:
```typescript
// BEFORE
selectionGroups?: {
    frontends?: string[];
    backends?: string[];
    dependencies?: string[];
    integrations?: string[];
    appBuilderApps?: string[];
};

// AFTER (no change - already correct)
selectionGroups?: {
    frontends?: string[];
    backends?: string[];
    dependencies?: string[];
    integrations?: string[];  // ✓ Already uses "integrations"
    appBuilderApps?: string[];
};
```

**Change 2 - ComponentRegistry interface**:
```typescript
// BEFORE
export interface ComponentRegistry {
    version: string;
    infrastructure?: TransformedComponentDefinition[];
    components: {
        frontends: TransformedComponentDefinition[];
        backends: TransformedComponentDefinition[];
        dependencies: TransformedComponentDefinition[];
        externalSystems?: TransformedComponentDefinition[];  // ❌ Rename this
        appBuilder?: TransformedComponentDefinition[];
    };
}

// AFTER
export interface ComponentRegistry {
    version: string;
    infrastructure?: TransformedComponentDefinition[];
    components: {
        frontends: TransformedComponentDefinition[];
        backends: TransformedComponentDefinition[];
        dependencies: TransformedComponentDefinition[];
        integrations?: TransformedComponentDefinition[];  // ✓ Renamed
        appBuilder?: TransformedComponentDefinition[];
    };
}
```

**Change 3 - ComponentSelection interface**:
```typescript
// BEFORE
export interface ComponentSelection {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    externalSystems?: string[];  // ❌ Rename this
    appBuilder?: string[];
}

// AFTER
export interface ComponentSelection {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    integrations?: string[];  // ✓ Renamed
    appBuilder?: string[];
}
```

### Phase 2: Update Backend Services

**File: `src/features/components/services/ComponentRegistryManager.ts`**

**Change 1 - Component bucket initialization**:
```typescript
// BEFORE
const components: {
    frontends: TransformedComponentDefinition[];
    backends: TransformedComponentDefinition[];
    dependencies: TransformedComponentDefinition[];
    externalSystems: TransformedComponentDefinition[];
    appBuilder: TransformedComponentDefinition[];
} = {
    frontends: [],
    backends: [],
    dependencies: [],
    externalSystems: [],
    appBuilder: [],
};

// AFTER
const components: {
    frontends: TransformedComponentDefinition[];
    backends: TransformedComponentDefinition[];
    dependencies: TransformedComponentDefinition[];
    integrations: TransformedComponentDefinition[];
    appBuilder: TransformedComponentDefinition[];
} = {
    frontends: [],
    backends: [],
    dependencies: [],
    integrations: [],
    appBuilder: [],
};
```

**Change 2 - Transformation logic (remove mapping)**:
```typescript
// BEFORE (mapping between names)
(groups.integrations || []).forEach((id: string) => {
    const enhanced = enhanceComponent(id);
    if (enhanced) components.externalSystems.push(enhanced);
});

// AFTER (direct mapping)
(groups.integrations || []).forEach((id: string) => {
    const enhanced = enhanceComponent(id);
    if (enhanced) components.integrations.push(enhanced);
});
```

**Change 3 - Getter method**:
```typescript
// BEFORE
async getExternalSystems(): Promise<TransformedComponentDefinition[]> {
    const registry = await this.loadRegistry();
    return registry.components.externalSystems || [];
}

// AFTER
async getIntegrations(): Promise<TransformedComponentDefinition[]> {
    const registry = await this.loadRegistry();
    return registry.components.integrations || [];
}
```

**Change 4 - getComponentById method**:
```typescript
// BEFORE
async getComponentById(id: string): Promise<ComponentDefinition | undefined> {
    const registry = await this.loadRegistry();
    const allComponents = [
        ...registry.components.frontends,
        ...registry.components.backends,
        ...registry.components.dependencies,
        ...(registry.components.externalSystems || []),
        ...(registry.components.appBuilder || []),
    ];
    return allComponents.find(c => c.id === id) as ComponentDefinition | undefined;
}

// AFTER
async getComponentById(id: string): Promise<ComponentDefinition | undefined> {
    const registry = await this.loadRegistry();
    const allComponents = [
        ...registry.components.frontends,
        ...registry.components.backends,
        ...registry.components.dependencies,
        ...(registry.components.integrations || []),
        ...(registry.components.appBuilder || []),
    ];
    return allComponents.find(c => c.id === id) as ComponentDefinition | undefined;
}
```

**File: `src/features/components/services/componentRegistry.ts`** (Same changes)

### Phase 3: Update Handlers

**File: `src/features/components/handlers/componentHandler.ts`**

Search and replace:
- `getExternalSystems()` → `getIntegrations()`
- `externalSystems` → `integrations`

### Phase 4: Update Frontend Components

**File: `webview-ui/src/wizard/steps/ComponentSelectionStep.tsx`**

**Change 1 - State variables**:
```typescript
// BEFORE
const [selectedExternalSystems, setSelectedExternalSystems] = useState<Set<string>>(
    new Set(components.externalSystems || [])
);

// AFTER
const [selectedIntegrations, setSelectedIntegrations] = useState<Set<string>>(
    new Set(components.integrations || [])
);
```

**Change 2 - useEffect initialization**:
```typescript
// BEFORE
if (comps.externalSystems) setSelectedExternalSystems(new Set(comps.externalSystems));

// AFTER
if (comps.integrations) setSelectedIntegrations(new Set(comps.integrations));
```

**Change 3 - useEffect dependencies**:
```typescript
// BEFORE
}, [selectedFrontend, selectedBackend, selectedDependencies, selectedServices, selectedExternalSystems, selectedAppBuilder, setCanProceed, updateState]);

// AFTER
}, [selectedFrontend, selectedBackend, selectedDependencies, selectedServices, selectedIntegrations, selectedAppBuilder, setCanProceed, updateState]);
```

**Change 4 - State update object**:
```typescript
// BEFORE
const components = {
    frontend: selectedFrontend,
    backend: selectedBackend,
    dependencies: Array.from(selectedDependencies),
    services: Array.from(selectedServices),
    externalSystems: Array.from(selectedExternalSystems),
    appBuilderApps: Array.from(selectedAppBuilder)
};

// AFTER
const components = {
    frontend: selectedFrontend,
    backend: selectedBackend,
    dependencies: Array.from(selectedDependencies),
    services: Array.from(selectedServices),
    integrations: Array.from(selectedIntegrations),
    appBuilderApps: Array.from(selectedAppBuilder)
};
```

**Change 5 - UI data source**:
```typescript
// BEFORE
const externalSystemsOptions = dataTyped.externalSystems || [...];

// AFTER
const integrationsOptions = dataTyped.integrations || [...];
```

**Change 6 - Checkbox handler**:
```typescript
// BEFORE
<Checkbox
    isSelected={selectedExternalSystems.has(system.id)}
    onChange={(isSelected) => {
        setSelectedExternalSystems(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(system.id);
            } else {
                newSet.delete(system.id);
            }
            return newSet;
        });
    }}
/>

// AFTER
<Checkbox
    isSelected={selectedIntegrations.has(system.id)}
    onChange={(isSelected) => {
        setSelectedIntegrations(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(system.id);
            } else {
                newSet.delete(system.id);
            }
            return newSet;
        });
    }}
/>
```

**Change 7 - Section label (optional UI update)**:
```typescript
// BEFORE
<Text>External Systems</Text>

// AFTER (could keep as is, or update to)
<Text>Integrations</Text>
```

### Phase 5: Update Other Frontend Files

**File: `webview-ui/src/wizard/components/WizardContainer.tsx`**

Check for any references to `externalSystems` in:
- Type definitions
- State management
- Message handlers

**File: `webview-ui/src/configure/ConfigureScreen.tsx`** (if exists)

Update any component selection references.

### Phase 6: Update Message Handlers

**File: `src/features/components/handlers/componentHandlers.ts`**

Update any message payload structures:
```typescript
// BEFORE
{
    externalSystems: [...],
}

// AFTER
{
    integrations: [...],
}
```

## Verification Strategy

### Automated Checks

**1. Grep for remaining references**:
```bash
# Should return zero results
grep -rn "externalSystems" src --include="*.ts" --include="*.tsx"
grep -rn "externalSystems" webview-ui --include="*.ts" --include="*.tsx"
```

**2. TypeScript compilation**:
```bash
npm run compile:typescript
```

**3. Webpack build**:
```bash
npm run compile:webview
```

### Manual Testing

**Wizard Flow**:
1. Open wizard (Demo Builder: Create New Project)
2. Navigate to Component Selection step
3. Verify "External Systems" / "Integrations" section displays
4. Select/deselect integrations
5. Continue to next step
6. Verify selections are preserved
7. Complete project creation

**Configure Flow**:
1. Open existing project
2. Launch configure command
3. Verify component data loads
4. Check integration selections

**State Persistence**:
1. Make selections in wizard
2. Close VS Code
3. Reopen and resume wizard
4. Verify integrations selection persisted

## Success Criteria

- [ ] All TypeScript types use `integrations` instead of `externalSystems`
- [ ] All backend code uses `integrations`
- [ ] All frontend code uses `selectedIntegrations`
- [ ] All message payloads use `integrations`
- [ ] Grep returns zero results for `externalSystems`
- [ ] TypeScript compiles without errors
- [ ] Webpack builds without warnings
- [ ] Wizard component selection works
- [ ] Configure command works
- [ ] State persists correctly

## Rollback Plan

If issues discovered:
```bash
git checkout src/types/components.ts
git checkout src/features/components/services/ComponentRegistryManager.ts
git checkout src/features/components/services/componentRegistry.ts
git checkout webview-ui/src/wizard/steps/ComponentSelectionStep.tsx
npm run compile
```

## Post-Implementation

### Documentation Updates
- Update `src/CLAUDE.md`
- Update `src/features/CLAUDE.md`
- Update `templates/CLAUDE.md`
- Create ADR: `docs/architecture/adr/001-component-naming.md`

### Commit Message
```
refactor: standardize component naming to "integrations"

Replace "externalSystems" with "integrations" throughout codebase
to align with JSON configuration naming convention.

Changes:
- Update TypeScript type definitions
- Rename backend service methods
- Update React component state variables
- Update message handlers

Breaking: None (internal refactoring only)

Resolves: standardize-component-naming plan
```

## Notes

- UI label "External Systems" can remain or be updated to "Integrations"
- No functional changes, only naming consistency
- Total changes: ~30 references across 8-10 files
- Estimated time: 1 hour implementation + 30 min testing
