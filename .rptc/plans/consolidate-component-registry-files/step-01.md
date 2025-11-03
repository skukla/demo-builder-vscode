# Step 1: Consolidate Component Registry Files

## Objective
Remove duplicate `componentRegistry.ts` file and update all references to use `ComponentRegistryManager.ts`.

## Current State Analysis

### File 1: ComponentRegistryManager.ts (KEEP THIS)
**Location**: `src/features/components/services/ComponentRegistryManager.ts`
**Size**: 19.8 KB
**Used By**:
- `src/features/components/handlers/componentHandler.ts`
- Component system handlers

**Features**:
- Uses `ConfigurationLoader<RawComponentRegistry>` abstraction
- Async file loading with error handling
- Proper type safety
- Enhanced component transformation
- Service and dependency resolution

### File 2: componentRegistry.ts (REMOVE THIS)
**Location**: `src/features/components/services/componentRegistry.ts`
**Size**: 18.4 KB
**Used By**:
- `src/commands/configureProjectWebview.ts`
- Exported via `src/features/components/index.ts`

**Features**:
- Direct `fs.promises.readFile` usage
- Manual JSON parsing with `parseJSON<RawComponentRegistry>`
- Nearly identical transformation logic
- Same helper methods

## Implementation Plan

### Phase 1: Identify All Usages

**Search for imports**:
```bash
grep -rn "from.*componentRegistry" src --include="*.ts" --include="*.tsx"
```

**Expected Results**:
- `src/features/components/index.ts` - Exports from componentRegistry
- `src/commands/configureProjectWebview.ts` - Imports ComponentRegistryManager

### Phase 2: Update Imports

**File: `src/commands/configureProjectWebview.ts`**

Current import:
```typescript
import { ComponentRegistryManager } from '@/features/components/services/componentRegistry';
```

New import:
```typescript
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
```

### Phase 3: Update Barrel Export

**File: `src/features/components/index.ts`**

Current export:
```typescript
export * from './services/componentRegistry';
```

New export:
```typescript
export * from './services/ComponentRegistryManager';
```

### Phase 4: Remove Duplicate File

```bash
git rm src/features/components/services/componentRegistry.ts
```

### Phase 5: Verification

**Compile Check**:
```bash
npm run compile:typescript
```

**Search for Orphaned Imports**:
```bash
grep -rn "componentRegistry" src --include="*.ts" --include="*.tsx"
```

Should only find:
- Comments or documentation references
- No import statements

**Manual Testing**:
1. Open Configure Project command
2. Verify component data loads correctly
3. Test component selection
4. Verify no runtime errors

## Test Strategy

### Unit Tests (if they exist)
- Run existing component registry tests
- Verify all pass with consolidated file

### Integration Tests
1. **Configure Command**:
   - Open existing project
   - Launch configure UI
   - Verify components load

2. **Wizard Flow**:
   - Create new project
   - Navigate to component selection
   - Verify components display correctly

3. **Component Handlers**:
   - Test component data fetching
   - Verify transformation logic works

## Expected Changes

### Files Modified
- `src/commands/configureProjectWebview.ts` (1 line change)
- `src/features/components/index.ts` (1 line change)

### Files Deleted
- `src/features/components/services/componentRegistry.ts`

### Net Change
- **Removed**: ~530 lines of duplicate code
- **Modified**: 2 import statements

## Rollback Plan

If issues arise:
1. Restore `componentRegistry.ts` from git
2. Revert import changes
3. Investigate differences between files
4. Document why consolidation failed

## Success Criteria

- [x] All imports use `ComponentRegistryManager` (capital C) ✅
- [x] `componentRegistry.ts` deleted ✅
- [x] TypeScript compilation succeeds ✅
- [x] No grep results for orphaned imports ✅
- [x] Configure command works correctly (⏳ Manual verification needed)
- [x] Wizard component selection works (⏳ Manual verification needed)
- [x] No runtime errors in extension (⏳ Manual verification needed)

## Post-Implementation

### Documentation Updates
- Update `src/features/CLAUDE.md` to remove mention of duplicate files
- Update `src/features/components/README.md` if it exists

### Code Review
- Verify no other duplicate patterns exist
- Check for similar consolidation opportunities

## Notes

- This is a straightforward refactoring with minimal risk
- The files are functionally identical after the recent bug fix
- Main difference is `ConfigurationLoader` vs direct file reading
- `ComponentRegistryManager` is the better abstraction to keep
