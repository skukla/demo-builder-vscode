# Plan: Standardize Component Naming (Integrations vs ExternalSystems)

## Status
- **State**: Not Started
- **Priority**: Low-Medium
- **Type**: Refactoring / Standardization
- **Estimated Effort**: 2-3 hours

## Problem Statement

There is a naming inconsistency between the JSON configuration layer and the internal TypeScript code:

**JSON Layer** (`templates/components.json`):
```json
{
  "selectionGroups": {
    "frontends": ["citisignal-nextjs"],
    "backends": ["adobe-commerce-paas"],
    "integrations": ["experience-platform"]  // ← Business terminology
  }
}
```

**Code Layer** (TypeScript):
```typescript
interface ComponentRegistry {
    components: {
        frontends: TransformedComponentDefinition[];
        backends: TransformedComponentDefinition[];
        externalSystems: TransformedComponentDefinition[];  // ← Technical terminology
    };
}
```

**UI Layer** (React):
```typescript
// ComponentSelectionStep.tsx
const [selectedExternalSystems, setSelectedExternalSystems] = useState<Set<string>>();
```

### Current Mapping

The transformation code maps between these names:
```typescript
(groups.integrations || []).forEach((id: string) => {
    // Maps JSON "integrations" → internal "externalSystems"
    if (enhanced) components.externalSystems.push(enhanced);
});
```

## Impact of Inconsistency

### Cognitive Load
- Developers must remember: JSON = "integrations", Code = "externalSystems"
- Context switching between layers requires mental translation
- New contributors confused by terminology mismatch

### Potential for Bugs
- Easy to use wrong property name when accessing data
- Type safety doesn't catch semantic mismatches
- Recent bug required fixing keys in multiple places due to confusion

### Documentation Complexity
- Must explain mapping in multiple places
- Architecture documents need clarification
- API boundaries become unclear

### Discoverability
- Searching for "integrations" misses code usage
- Searching for "externalSystems" misses JSON config
- Harder to trace data flow through system

## Options Analysis

### Option 1: Standardize on "integrations" (Business Term)

**Pros**:
- Matches user-facing concept
- Aligns with JSON configuration (source of truth)
- Easier for product managers to understand
- Consistent with Adobe terminology

**Cons**:
- "Integrations" is vague (could mean App Builder integrations too)
- Less technically descriptive
- Could conflict with future integration types

**Changes Required**:
- Rename `externalSystems` → `integrations` in TypeScript types
- Update all code references
- Update React component state variables
- Update documentation

### Option 2: Standardize on "externalSystems" (Technical Term)

**Pros**:
- More descriptive and precise
- Clear technical distinction from App Builder apps
- Better separates external vs internal systems

**Cons**:
- Doesn't match JSON configuration
- Breaks from Adobe business terminology
- Requires JSON schema change (potential breaking change)

**Changes Required**:
- Rename `integrations` → `externalSystems` in JSON
- Update templates/components.json
- Update JSON schema
- Verify backward compatibility
- Update documentation

### Option 3: Hybrid Approach (Keep Current Mapping)

**Pros**:
- No breaking changes required
- Preserves business/technical separation
- JSON remains user-friendly

**Cons**:
- Maintains current confusion
- Doesn't solve cognitive load problem
- Mapping layer adds complexity

**Changes Required**:
- Document the mapping clearly
- Add JSDoc comments explaining relationship
- Create architecture decision record (ADR)

## Recommended Approach

**Option 1: Standardize on "integrations"**

### Rationale

1. **JSON is Source of Truth**: Configuration drives behavior, code should follow
2. **User-Facing**: Matches product terminology users understand
3. **Least Disruptive**: No JSON schema changes, no backward compatibility issues
4. **Aligns with Adobe Ecosystem**: Consistent with Adobe Experience Cloud terminology

### Trade-offs Accepted

- Slightly less descriptive than "externalSystems"
- May need future clarification if other integration types emerge
- Technical precision traded for business alignment

## Implementation Strategy

### Phase 1: Type Definitions
- Update `src/types/components.ts`
- Rename `externalSystems` → `integrations` in interfaces
- Update JSDoc comments

### Phase 2: Backend Code
- Update ComponentRegistry transformation logic
- Rename internal properties
- Update helper methods

### Phase 3: Frontend Code
- Update React component state variables
- Rename `selectedExternalSystems` → `selectedIntegrations`
- Update UI labels if needed

### Phase 4: Documentation
- Update CLAUDE.md files
- Update architecture diagrams
- Add ADR explaining decision

### Phase 5: Testing
- Verify all component flows work
- Test wizard selection
- Test configure command
- No runtime errors

## Success Criteria

- [ ] Consistent naming throughout: JSON → Types → Code → UI
- [ ] No references to "externalSystems" remain (except in legacy docs)
- [ ] All tests pass
- [ ] No regression in functionality
- [ ] Documentation updated with new terminology
- [ ] ADR created explaining decision

## Files Affected

### Type Definitions
- `src/types/components.ts`

### Backend Services
- `src/features/components/services/ComponentRegistryManager.ts`
- `src/features/components/services/componentRegistry.ts`
- `src/features/components/handlers/componentHandler.ts`

### Frontend Components
- `webview-ui/src/wizard/steps/ComponentSelectionStep.tsx`
- `webview-ui/src/configure/ConfigureScreen.tsx` (if exists)

### Documentation
- `src/CLAUDE.md`
- `src/features/CLAUDE.md`
- `templates/CLAUDE.md`
- Create: `docs/architecture/adr/001-component-naming.md`

## Dependencies

- Should complete AFTER `consolidate-component-registry-files` plan
- No blocking dependencies

## Risks

**Low Risk**:
- Purely internal refactoring
- No external API changes
- Automated search/replace for most changes

**Medium Risk**:
- May miss some references in comments/docs
- Could affect serialization if state is persisted

**Mitigation**:
- Comprehensive grep for all variations
- Test all component selection flows
- Review state persistence code
- Staged rollout with verification

## Migration Guide

For developers:

**Before**:
```typescript
const systems = registry.components.externalSystems;
const [selectedExternalSystems, setSelectedExternalSystems] = useState();
```

**After**:
```typescript
const systems = registry.components.integrations;
const [selectedIntegrations, setSelectedIntegrations] = useState();
```

## Notes

- This is a naming standardization with no functional changes
- Improves code clarity and maintainability
- Reduces friction for new contributors
- Aligns codebase with business terminology
- Consider as part of broader architecture cleanup

## Related Issues

- Discovered during: `component-defaults-not-loading` fix
- Related to: Code consistency and naming conventions
- Part of: Component architecture standardization
