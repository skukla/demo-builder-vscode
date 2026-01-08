# Component Updates: Environment Variable Migration

## Problem Statement

**Component updates currently do NOT handle environment variable name changes**, leading to runtime failures when:
1. A component update changes variable names in its code/config files
2. The `.env` file retains the old variable names
3. The component fails at runtime due to missing required variables

### Real-World Example

**Mesh v1.0.0-beta.2 → v1.0.0-beta.3**
- **Before update**: `.env` contains `CATALOG_SERVICE_ENDPOINT=...`
- **After update**: `mesh.json` expects `{env.ADOBE_CATALOG_SERVICE_ENDPOINT}`
- **Result**: Deployment fails with "missing keys: ADOBE_CATALOG_SERVICE_ENDPOINT"

## Current Behavior

The `.env` merge logic in `ComponentUpdater.mergeEnvFiles()`:

### ✅ What It Does
- Backs up old `.env` file before update
- Preserves existing user-configured values
- Adds new variables from updated `.env.example`
- Prevents data loss during updates

### ❌ What It Doesn't Do
- Detect renamed variables
- Migrate old → new variable names
- Validate required variables after merge
- Warn users of incomplete configuration

## Affected Components

### Components at Risk
Any component that:
- Changes variable names between versions
- Adds new required variables
- Removes/deprecates old variables

### Current Known Cases
- **commerce-mesh**: Variable naming convention changes (CATALOG_SERVICE_ENDPOINT ↔ ADOBE_CATALOG_SERVICE_ENDPOINT)
- **Future components**: Any breaking configuration changes

## Solution Options

### Option 1: Backward Compatibility (RECOMMENDED)
**Component maintains support for both old and new variable names**

#### Pros
- No migration logic needed in update flow
- Simpler for users (updates "just work")
- Gradual deprecation path
- No risk of data loss

#### Cons
- Component code has legacy cruft
- Requires component authors to plan ahead

#### Implementation Example (mesh.json)
```json
{
  "sources": [{
    "name": "CatalogServiceSandbox",
    "handler": {
      "graphql": {
        "endpoint": "{env.CATALOG_SERVICE_ENDPOINT || env.ADOBE_CATALOG_SERVICE_ENDPOINT}",
        "operationHeaders": {
          "x-api-key": "{env.ADOBE_CATALOG_API_KEY}"
        }
      }
    }
  }]
}
```

#### Deprecation Strategy
1. **Version N**: Add new variable name alongside old (both work)
2. **Version N+1**: Log deprecation warning for old name
3. **Version N+2**: Remove old variable name support (breaking change)

---

### Option 2: Migration Logic in Update Flow
**ComponentUpdater applies variable renames during .env merge**

#### Pros
- Clean component code (no legacy support needed)
- Centralized migration logic
- Can handle complex transformations

#### Cons
- More complex update logic
- Risk of migration bugs
- Requires component metadata (migration maps)
- Can't handle all scenarios (e.g., value transformations)

#### Implementation Approach

**1. Add Migration Metadata to components.json**
```json
{
  "mesh": {
    "commerce-mesh": {
      "migrations": {
        "1.0.0-beta.3": {
          "envVarRenames": {
            "CATALOG_SERVICE_ENDPOINT": "ADOBE_CATALOG_SERVICE_ENDPOINT"
          }
        }
      }
    }
  }
}
```

**2. Update ComponentUpdater.mergeEnvFiles()**
```typescript
private async mergeEnvFiles(
    componentPath: string,
    oldEnvFiles: Map<string, string>,
    migrations?: EnvVarMigrations, // NEW parameter
): Promise<void> {
    // Parse old .env
    const oldVars = parseEnvFile(oldContent);
    
    // Apply migrations
    if (migrations) {
        for (const [oldName, newName] of Object.entries(migrations.envVarRenames || {})) {
            if (oldName in oldVars) {
                this.logger.info(`[Updates] Migrating ${oldName} → ${newName}`);
                oldVars[newName] = oldVars[oldName];
                delete oldVars[oldName]; // Remove old name
            }
        }
    }
    
    // Merge with new .env.example
    const mergedVars = { ...newDefaults, ...oldVars };
    
    // Write merged .env
    await fs.writeFile(envPath, generateEnvContent(mergedVars));
}
```

**3. Call with Migration Data**
```typescript
const componentDef = await ComponentRegistryManager.getInstance()
    .getComponentById(componentId);
const migrations = componentDef?.migrations?.[newVersion];

await this.mergeEnvFiles(componentPath, oldEnvFiles, migrations);
```

---

### Option 3: Post-Update Validation (COMPLEMENT to Option 1 or 2)
**Validate required env vars exist after update, warn if missing**

#### Pros
- Catches issues regardless of cause
- User-friendly error messaging
- Works with any solution approach

#### Cons
- Doesn't fix the issue, only detects it
- Requires user action after update

#### Implementation
```typescript
private async validateEnvVars(
    componentPath: string,
    componentDef: TransformedComponentDefinition,
): Promise<void> {
    const envPath = path.join(componentPath, '.env');
    const envContent = await fs.readFile(envPath, 'utf-8');
    const envVars = parseEnvFile(envContent);
    
    const missingVars = componentDef.configuration.requiredEnvVars
        .filter(varName => !(varName in envVars));
    
    if (missingVars.length > 0) {
        this.logger.warn(
            `[Updates] Missing required env vars after update: ${missingVars.join(', ')}`
        );
        
        // Show user notification
        const action = await vscode.window.showWarningMessage(
            `${componentDef.name} update completed, but configuration may be incomplete.`,
            'Reconfigure',
            'Dismiss'
        );
        
        if (action === 'Reconfigure') {
            // Open configuration UI
            await vscode.commands.executeCommand('demoBuilder.configure', componentPath);
        }
    }
}
```

---

### Option 4: Full Regeneration (NOT RECOMMENDED)
**Regenerate .env from scratch on every update**

#### Pros
- Always matches component's expected config
- No migration logic needed

#### Cons
- **LOSES ALL USER CUSTOMIZATIONS**
- Breaks existing deployments
- Requires manual reconfiguration after every update
- Poor user experience

**Status: REJECTED**

---

## Recommended Solution

### Phase 1: Immediate Fix (Component-Side)
**Update commerce-mesh to support both variable names** (Option 1)

```json
// mesh.json - support both old and new names
{
  "endpoint": "{env.CATALOG_SERVICE_ENDPOINT || env.ADOBE_CATALOG_SERVICE_ENDPOINT}"
}
```

**Benefits**:
- Fixes existing user projects immediately
- No Demo Builder changes required
- Works for users who don't update immediately

---

### Phase 2: Add Post-Update Validation (Option 3)
**Detect and warn about missing variables after updates**

**Changes to ComponentUpdater**:
1. Add `validateEnvVars()` method
2. Call after `mergeEnvFiles()` completes
3. Show warning notification if validation fails
4. Provide "Reconfigure" button

**Benefits**:
- Catches this class of issues for all components
- User-friendly error messages
- Works with or without component backward compatibility

---

### Phase 3: Consider Migration Logic (Optional, Option 2)
**Only if backward compatibility becomes unmaintainable**

**When to implement**:
- Multiple components have frequent variable renames
- Backward compatibility adds significant complexity
- User requests for automatic migration

**Prerequisites**:
- Design migration metadata schema
- Implement in ComponentUpdater
- Add comprehensive tests
- Document for component authors

---

## Testing Strategy

### Current Status
❌ **NO tests exist for env variable migration scenarios**

### Required Test Coverage

**1. Component Update with Variable Renames**
- Test file: `componentUpdater-envMigration.test.ts`
- Scenarios:
  - Variable renamed in new version
  - Variable removed in new version
  - New required variable added
  - Multiple simultaneous changes

**2. Post-Update Validation**
- Test file: `componentUpdater-validation.test.ts`
- Scenarios:
  - Missing required variables detected
  - Warning shown to user
  - Reconfigure action triggered

**3. Integration Tests**
- Test file: `updates-integration.test.ts`
- Scenarios:
  - Full update flow with env migration
  - Rollback on validation failure
  - User interaction flows

---

## Documentation Updates

### For Component Authors
**File**: `docs/components/env-variable-guidelines.md`

**Topics**:
- Semantic versioning for config changes
- Backward compatibility strategies
- Deprecation path recommendations
- Migration metadata format (if implemented)

### For Extension Users
**File**: `docs/user-guide/updating-components.md`

**Topics**:
- What happens during component updates
- How .env files are preserved
- What to do if update fails
- Reconfiguration after updates

---

## Action Items

### Immediate (Phase 1)
- [ ] Update commerce-mesh to support both variable names
- [ ] Test with existing user projects
- [ ] Document backward compatibility pattern

### Short-term (Phase 2)
- [ ] Implement post-update validation in ComponentUpdater
- [ ] Add user notification for missing variables
- [ ] Write comprehensive tests for validation logic
- [ ] Update docs with validation behavior

### Long-term (Phase 3 - Optional)
- [ ] Design migration metadata schema
- [ ] Implement migration logic in ComponentUpdater
- [ ] Add tests for migration scenarios
- [ ] Document migration format for component authors

---

## Related Issues

- Initial mesh naming refactor (v1.0.0-beta.2)
- Mesh endpoint standardization
- Component configuration architecture
- Service endpoint resolution

---

## References

- `src/features/updates/services/componentUpdater.ts` - Update logic
- `src/features/project-creation/helpers/envFileGenerator.ts` - Env generation
- `tests/features/updates/services/componentUpdater-envMigration.test.ts` - Test coverage
- `docs/architecture/service-resolution.md` - Service architecture
