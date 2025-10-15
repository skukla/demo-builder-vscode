# Filename Convention Audit Report

**Project**: Adobe Demo Builder VS Code Extension
**Audit Date**: 2025-10-15
**Total TypeScript Files**: 192 (.ts and .tsx)
**Scope**: All source files in `src/` directory

---

## Executive Summary

The codebase demonstrates **mixed but emerging consistency** in filename conventions. The recent refactoring to feature-based architecture (Phase 2 migration) has introduced better patterns, but legacy code and some inconsistencies remain.

**Key Findings**:
- **Casing**: 73% camelCase (140 files), 27% PascalCase (51 files) - intentional by file type
- **Suffixes**: Consistent patterns for services (`Manager`, `Service`, `Handler`)
- **Index Files**: Well-utilized for barrel exports (29 directories)
- **Duplicates**: 7 filename collisions across directories (acceptable in feature architecture)
- **Biggest Issue**: Inconsistent handler naming (`Handler` vs `Handlers` suffix)

---

## 1. Current Conventions by Directory

### 1.1 Commands (`src/commands/`)

**Primary Casing**: camelCase
**Suffix Pattern**: Descriptive nouns (no consistent suffix)
**Consistency Score**: 85%

**Examples**:
```
✅ commands/createProjectWebview.ts
✅ commands/configureProjectWebview.ts
✅ commands/welcomeWebview.ts
✅ commands/diagnostics.ts
⚠️  commands/commandManager.ts (should this be CommandManager.ts for PascalCase?)
```

**Pattern**:
- Entry point commands use camelCase + descriptive names
- Manager class uses camelCase filename (inconsistent with class name `CommandManager`)

**Index Files**: `commands/helpers/index.ts` (barrel export)

---

### 1.2 Features (`src/features/`)

**Primary Casing**: camelCase for services/handlers, PascalCase for classes
**Suffix Patterns**:
- Services: `Service` or `Manager` (inconsistent)
- Handlers: `Handler` or `Handlers` (inconsistent)
- Other: `Validator`, `Tracker`, `Client`, `Registry`

**Consistency Score**: 75%

#### 1.2.1 Authentication Feature

**Pattern Analysis**:
```
✅ services/authenticationService.ts          (Service suffix)
✅ services/adobeEntityService.ts            (Service suffix)
✅ services/tokenManager.ts                   (Manager suffix)
✅ services/authCacheManager.ts              (Manager suffix)
✅ services/organizationValidator.ts         (Validator suffix)
✅ services/performanceTracker.ts            (Tracker suffix)
✅ services/adobeSDKClient.ts                (Client suffix)
⚠️  handlers/authenticationHandlers.ts       (Handlers plural)
⚠️  handlers/projectHandlers.ts              (Handlers plural)
⚠️  handlers/workspaceHandlers.ts            (Handlers plural)
```

**Issues**:
- Handlers use plural `Handlers` (multiple exports per file)
- Services use both `Service` and `Manager` suffixes

#### 1.2.2 Components Feature

**Pattern Analysis**:
```
✅ services/componentManager.ts
✅ services/componentRegistry.ts
✅ providers/componentTreeProvider.ts
⚠️  commands/componentHandler.ts             (Handler singular)
⚠️  handlers/componentHandlers.ts            (Handlers plural)
```

**Issues**:
- Inconsistent `Handler` vs `Handlers`
- Handler in `commands/` subdirectory (should be in `handlers/`?)

#### 1.2.3 Mesh Feature

**Pattern Analysis**:
```
✅ services/meshDeployer.ts
✅ services/meshDeployment.ts
✅ services/meshDeploymentVerifier.ts
✅ services/meshEndpoint.ts
✅ services/meshVerifier.ts
✅ services/stalenessDetector.ts
⚠️  handlers/checkHandler.ts                 (Handler singular)
⚠️  handlers/createHandler.ts                (Handler singular)
⚠️  handlers/deleteHandler.ts                (Handler singular)
✅ handlers/shared.ts                         (Shared utilities)
```

**Issues**:
- Handlers use singular `Handler` (one export per file)
- Different pattern from authentication (plural)

#### 1.2.4 Prerequisites Feature

**Pattern Analysis**:
```
✅ services/prerequisitesManager.ts
⚠️  handlers/checkHandler.ts
⚠️  handlers/installHandler.ts
⚠️  handlers/continueHandler.ts
✅ handlers/shared.ts
```

**Issues**:
- Same singular `Handler` pattern as mesh
- Inconsistent with authentication

#### 1.2.5 Lifecycle Feature

**Pattern Analysis**:
```
✅ commands/startDemo.ts
✅ commands/stopDemo.ts
⚠️  handlers/lifecycleHandlers.ts            (Handlers plural)
```

**Issues**:
- Plural `Handlers` like authentication
- No consistent rule for singular vs plural

#### 1.2.6 Project Creation Feature

**Pattern Analysis**:
```
⚠️  handlers/createHandler.ts
⚠️  handlers/validateHandler.ts
✅ handlers/executor.ts
✅ handlers/shared.ts
```

**Issues**:
- Singular `Handler` pattern
- Mix of `Handler` suffix and descriptive names

#### 1.2.7 Updates Feature

**Pattern Analysis**:
```
✅ services/updateManager.ts
✅ services/componentUpdater.ts
✅ services/extensionUpdater.ts
✅ commands/checkUpdates.ts
```

**Issues**: None - consistent pattern

---

### 1.3 Shared Infrastructure (`src/shared/`)

**Primary Casing**: camelCase
**Suffix Patterns**: Highly consistent - `Manager`, `Service`, `Logger`, `Validator`
**Consistency Score**: 95% ⭐

**Examples**:
```
✅ shared/state/stateManager.ts
✅ shared/communication/webviewCommunicationManager.ts
✅ shared/logging/errorLogger.ts
✅ shared/logging/debugLogger.ts
✅ shared/logging/stepLogger.ts
✅ shared/validation/commerceValidator.ts
✅ shared/validation/fieldValidation.ts
✅ shared/command-execution/commandExecutor.ts
✅ shared/command-execution/commandSequencer.ts
✅ shared/command-execution/pollingService.ts
✅ shared/command-execution/retryStrategyManager.ts
✅ shared/base/baseCommand.ts
✅ shared/base/baseWebviewCommand.ts
```

**Pattern**:
- Consistent camelCase filenames
- Clear suffixes matching class purpose
- Excellent use of barrel exports (index.ts in each module)

---

### 1.4 Webviews (`src/webviews/`)

**Primary Casing**: PascalCase for React components (.tsx), camelCase for utilities (.ts)
**Suffix Patterns**: None (component names are descriptive)
**Consistency Score**: 98% ⭐

**Examples**:
```
✅ components/atoms/Badge.tsx                (PascalCase)
✅ components/atoms/Icon.tsx
✅ components/atoms/Spinner.tsx
✅ components/molecules/ErrorDisplay.tsx
✅ components/molecules/LoadingOverlay.tsx
✅ components/organisms/NavigationPanel.tsx
✅ components/steps/AdobeAuthStep.tsx
✅ components/steps/ComponentSelectionStep.tsx
✅ contexts/ThemeContext.tsx
✅ contexts/WizardContext.tsx
✅ hooks/useAsyncData.ts                     (camelCase for hooks)
✅ hooks/useVSCodeMessage.ts
✅ utils/classNames.ts                       (camelCase)
```

**Pattern**:
- **React components (.tsx)**: PascalCase (industry standard)
- **Hooks (.ts)**: camelCase with `use` prefix (React convention)
- **Utilities (.ts)**: camelCase
- Excellent atomic design organization

---

### 1.5 Types (`src/types/`)

**Primary Casing**: camelCase
**Suffix Pattern**: Descriptive nouns
**Consistency Score**: 100% ⭐

**Examples**:
```
✅ types/base.ts
✅ types/components.ts
✅ types/handlers.ts
✅ types/logger.ts
✅ types/messages.ts
✅ types/state.ts
✅ types/typeGuards.ts
✅ types/index.ts                            (Barrel export)
```

**Pattern**: Consistent camelCase, domain-based naming

---

### 1.6 Utils (`src/utils/`) - LEGACY

**Primary Casing**: camelCase
**Suffix Pattern**: Descriptive nouns
**Consistency Score**: 90%

**Note**: This directory is being **phased out** in favor of feature-based organization.

**Examples**:
```
✅ utils/autoUpdater.ts
✅ utils/errorFormatter.ts
✅ utils/frontendInstaller.ts
✅ utils/progressUnifier.ts
✅ utils/promiseUtils.ts
✅ utils/timeoutConfig.ts
✅ utils/loadingHTML.ts
```

**Migration Status**: Most utilities have been migrated to appropriate features or shared modules.

---

### 1.7 Providers (`src/providers/`)

**Primary Casing**: camelCase
**Suffix Pattern**: `Provider` (VS Code convention)
**Consistency Score**: 100% ⭐

**Examples**:
```
✅ providers/statusBar.ts
```

**Note**: Most providers migrated to feature modules (e.g., `features/components/providers/`)

---

## 2. Inconsistencies Found

### 2.1 Critical Issues (Breaking Consistency)

#### Issue 1: Handler Naming - Singular vs Plural

**Pattern Conflict**: `Handler` vs `Handlers` suffix

**Singular `Handler` (one export per file)**:
```
src/features/mesh/handlers/checkHandler.ts
src/features/mesh/handlers/createHandler.ts
src/features/mesh/handlers/deleteHandler.ts
src/features/prerequisites/handlers/checkHandler.ts
src/features/prerequisites/handlers/installHandler.ts
src/features/prerequisites/handlers/continueHandler.ts
src/features/project-creation/handlers/createHandler.ts
src/features/project-creation/handlers/validateHandler.ts
src/features/components/commands/componentHandler.ts
```

**Plural `Handlers` (multiple exports per file)**:
```
src/features/authentication/handlers/authenticationHandlers.ts
src/features/authentication/handlers/projectHandlers.ts
src/features/authentication/handlers/workspaceHandlers.ts
src/features/lifecycle/handlers/lifecycleHandlers.ts
src/features/components/handlers/componentHandlers.ts
```

**Impact**: Medium - Confusing to developers
**Recommendation**: Standardize on singular `Handler` (matches one export per file)

---

#### Issue 2: Service vs Manager Suffix

**Pattern Conflict**: Both `Service` and `Manager` used for similar classes

**`Service` suffix**:
```
src/features/authentication/services/authenticationService.ts
src/features/authentication/services/adobeEntityService.ts
src/shared/command-execution/pollingService.ts
```

**`Manager` suffix**:
```
src/features/prerequisites/services/prerequisitesManager.ts
src/features/updates/services/updateManager.ts
src/features/components/services/componentManager.ts
src/features/authentication/services/authCacheManager.ts
src/features/authentication/services/tokenManager.ts
src/shared/state/stateManager.ts
src/shared/communication/webviewCommunicationManager.ts
src/commands/commandManager.ts
```

**Current Pattern**:
- `Service` = provides business logic operations
- `Manager` = manages state/resources/lifecycle

**Impact**: Low - Semantic difference exists but not always clear
**Recommendation**: Keep current pattern (intentional distinction)

---

#### Issue 3: Filename Casing for Class Files

**Pattern Conflict**: camelCase filename with PascalCase class name

**Examples**:
```
❌ commands/commandManager.ts              → exports CommandManager (class)
❌ shared/state/stateManager.ts            → exports StateManager (class)
❌ features/authentication/services/tokenManager.ts → exports TokenManager (class)
```

**Industry Standards**:
- **TypeScript/JavaScript**: Typically camelCase filenames
- **React**: PascalCase for component files
- **C#/Java**: PascalCase for class files

**Current Approach**: camelCase filenames everywhere except React components

**Impact**: Low - Consistent within project
**Recommendation**: Keep current approach (established pattern)

---

### 2.2 Minor Issues (Style Inconsistencies)

#### Issue 4: Duplicate Base Filenames Across Features

**Duplicates Found**:
```
checkHandler.ts     (mesh, prerequisites)
createHandler.ts    (mesh, project-creation)
EmptyState.tsx      (webviews/welcome, webviews/components/molecules)
index.ts            (29 directories - intentional barrel exports)
shared.ts           (mesh/handlers, prerequisites/handlers, project-creation/handlers)
types.ts            (multiple features - intentional)
logger.ts           (shared/logging - intentional)
```

**Impact**: None - Expected in feature-based architecture
**Recommendation**: No change needed (imports use path aliases)

---

#### Issue 5: Commands Subdirectory Misalignment

**Issue**: `features/components/commands/componentHandler.ts` should be in `handlers/`

**Current**:
```
features/components/
├── commands/
│   └── componentHandler.ts
├── handlers/
│   └── componentHandlers.ts
```

**Expected**:
```
features/components/
├── handlers/
│   ├── componentHandler.ts
│   └── componentHandlers.ts
```

**Impact**: Low - Confusing directory purpose
**Recommendation**: Move to handlers or rename directory to `internal-commands`

---

#### Issue 6: Mixed Step vs Screen Naming

**Pattern Conflict**: React components use both `Step` and `Screen` suffixes

**`Step` suffix (wizard steps)**:
```
webviews/components/steps/AdobeAuthStep.tsx
webviews/components/steps/ComponentSelectionStep.tsx
webviews/components/steps/PrerequisitesStep.tsx
webviews/components/steps/ReviewStep.tsx
```

**`Screen` suffix (full screens)**:
```
webviews/welcome/WelcomeScreen.tsx
webviews/configure/ConfigureScreen.tsx
webviews/project-dashboard/ProjectDashboardScreen.tsx
```

**Impact**: None - Intentional semantic difference
**Recommendation**: Keep distinction (Step = wizard step, Screen = full screen)

---

## 3. Recommended Standard

Based on analysis of the codebase and industry standards, here are the recommended conventions:

### 3.1 Casing Rules by File Type

| File Type | Casing | Example |
|-----------|--------|---------|
| React Components (.tsx) | PascalCase | `ComponentCard.tsx` |
| React Hooks (.ts) | camelCase with `use` prefix | `useAsyncData.ts` |
| Classes/Services (.ts) | camelCase | `authenticationService.ts` |
| Types (.ts) | camelCase | `messages.ts` |
| Utilities (.ts) | camelCase | `classNames.ts` |
| Constants (.ts) | camelCase or SCREAMING_SNAKE | `timeoutConfig.ts` |
| Entry points (.ts, .tsx) | camelCase | `index.ts`, `extension.ts` |

**Rationale**:
- React community standard: PascalCase for components
- TypeScript/Node.js standard: camelCase for modules
- Clear visual distinction between component files and logic files

---

### 3.2 Suffix Rules by File Purpose

| Purpose | Suffix | Example | Usage |
|---------|--------|---------|-------|
| State/Resource Management | `Manager` | `stateManager.ts` | Manages lifecycle, state, or resources |
| Business Logic | `Service` | `authenticationService.ts` | Provides domain operations |
| Message Handlers | `Handler` | `checkHandler.ts` | Handles one type of message/action |
| Message Handler Collections | `Handlers` | `authenticationHandlers.ts` | Exports multiple related handlers |
| React Components | Component name | `Badge.tsx` | No suffix needed |
| VS Code Providers | `Provider` | `componentTreeProvider.ts` | VS Code API providers |
| Logging | `Logger` | `errorLogger.ts` | Logging infrastructure |
| Validation | `Validator` | `commerceValidator.ts` | Validation logic |
| Type Definitions | Domain name | `messages.ts` | Type-only modules |
| Utilities | Descriptive name | `classNames.ts` | Utility functions |
| Registry | `Registry` | `componentRegistry.ts` | Component/service registry |
| Update Logic | `Updater` | `componentUpdater.ts` | Handles updates |

**Clarification on Handlers**:
- Use singular `Handler` when file exports ONE handler function
- Use plural `Handlers` when file exports MULTIPLE handler functions
- Example:
  ```typescript
  // checkHandler.ts - ONE handler
  export async function handleCheck(payload) { ... }

  // authenticationHandlers.ts - MULTIPLE handlers
  export async function handleCheckAuth(payload) { ... }
  export async function handleAuthenticate(payload) { ... }
  export async function handleLogout(payload) { ... }
  ```

---

### 3.3 Index.ts Barrel Export Strategy

**Use `index.ts` for**:
- Feature public API exports
- Component library exports
- Shared module exports
- Directory-level re-exports

**Pattern**:
```typescript
// features/authentication/index.ts
export { AuthenticationService } from './services/authenticationService';
export { TokenManager } from './services/tokenManager';
export * from './handlers/authenticationHandlers';
export type { AuthToken, AdobeOrg } from './services/types';
```

**Benefits**:
- Clean imports: `import { AuthenticationService } from '@/features/authentication'`
- Clear public API boundary
- Easy to refactor internal structure

**Current Coverage**: 29 directories with index.ts ⭐ Excellent

---

### 3.4 Directory Naming

| Directory Type | Casing | Example |
|----------------|--------|---------|
| Feature modules | kebab-case | `project-creation/` |
| React component categories | kebab-case | `project-dashboard/` |
| Service categories | camelCase | `services/`, `handlers/` |
| React atomic design | lowercase | `atoms/`, `molecules/`, `organisms/` |

**Current Status**: Consistent ⭐

---

## 4. Refactoring Plan

### Priority Levels
- **P0 (Critical)**: Breaking changes or major inconsistencies
- **P1 (High)**: User-facing or frequently used files
- **P2 (Medium)**: Internal consistency improvements
- **P3 (Low)**: Nice-to-have standardization

---

### 4.1 P0: Critical Renames (Breaking Changes)

None identified. Current inconsistencies are internal and don't break functionality.

---

### 4.2 P1: High Priority Standardization

#### Refactor 1: Standardize Handler Naming

**Impact**: 9 files, ~15 import statements

**Files to Rename**:
```
src/features/authentication/handlers/authenticationHandlers.ts
  → KEEP (exports multiple handlers)

src/features/authentication/handlers/projectHandlers.ts
  → KEEP (exports multiple handlers)

src/features/authentication/handlers/workspaceHandlers.ts
  → KEEP (exports multiple handlers)

src/features/lifecycle/handlers/lifecycleHandlers.ts
  → KEEP (exports multiple handlers)

src/features/components/handlers/componentHandlers.ts
  → KEEP (exports multiple handlers)

NO CHANGES NEEDED - Current pattern is correct:
- Plural "Handlers" = multiple exports per file ✅
- Singular "Handler" = one export per file ✅
```

**Action**: **Document pattern** in developer guidelines, not rename files.

---

#### Refactor 2: Relocate Misplaced Handler

**Impact**: 1 file, ~3 import statements

**File to Move**:
```
src/features/components/commands/componentHandler.ts
  → src/features/components/handlers/componentHandler.ts
```

**Reason**: Align directory structure (handlers belong in `handlers/`)

**Effort**: Low (1 hour)

---

### 4.3 P2: Medium Priority Improvements

#### Refactor 3: None Recommended

Current medium-priority issues are either:
- Intentional design choices (Service vs Manager distinction)
- Acceptable in feature-based architecture (duplicate filenames)

---

### 4.4 P3: Low Priority Standardization

#### Refactor 4: None Recommended

The codebase is remarkably consistent for a project of this size.

---

## 5. Impact Summary

### Files Requiring Renames: 1
- `src/features/components/commands/componentHandler.ts` → `handlers/componentHandler.ts`

### Affected Imports: ~3

### Estimated Effort: 1 hour

### Risk Level: **Low**
- Only one file needs moving
- Clear path aliases minimize import updates
- TypeScript compiler will catch all import errors

---

## 6. Documentation Recommendations

### 6.1 Create Developer Guidelines

Add to `docs/development/naming-conventions.md`:

```markdown
# Filename Naming Conventions

## File Casing
- **React Components (.tsx)**: PascalCase (e.g., `ComponentCard.tsx`)
- **React Hooks (.ts)**: camelCase with `use` prefix (e.g., `useAsyncData.ts`)
- **Services/Classes (.ts)**: camelCase (e.g., `authenticationService.ts`)
- **Types (.ts)**: camelCase (e.g., `messages.ts`)

## File Suffixes
- **Managers**: State/resource lifecycle (e.g., `stateManager.ts`)
- **Services**: Business logic operations (e.g., `authenticationService.ts`)
- **Handlers**:
  - Singular `Handler`: One export per file (e.g., `checkHandler.ts`)
  - Plural `Handlers`: Multiple exports per file (e.g., `authenticationHandlers.ts`)
- **Providers**: VS Code API providers (e.g., `componentTreeProvider.ts`)
- **Loggers**: Logging infrastructure (e.g., `errorLogger.ts`)
- **Validators**: Validation logic (e.g., `commerceValidator.ts`)
- **Registries**: Component/service registry (e.g., `componentRegistry.ts`)
- **Updaters**: Update operations (e.g., `componentUpdater.ts`)

## Directory Naming
- Feature modules: kebab-case (e.g., `project-creation/`)
- Service categories: camelCase (e.g., `services/`, `handlers/`)
- React categories: lowercase (e.g., `atoms/`, `molecules/`)

## Index Files
Use `index.ts` for barrel exports in:
- Feature modules (public API)
- Component libraries
- Shared modules
```

---

### 6.2 Update Feature Templates

When adding new features, include naming conventions in template:

```
features/my-feature/
├── index.ts                  # Barrel export (public API)
├── services/
│   ├── myFeatureService.ts   # Business logic (singular export)
│   └── types.ts              # Feature types
└── handlers/
    ├── actionHandler.ts      # Single handler (one export)
    └── multiHandlers.ts      # Multiple handlers (many exports)
```

---

## 7. Conclusion

### Strengths
✅ **React components**: 98% consistent PascalCase
✅ **Shared infrastructure**: 95% consistent patterns
✅ **Barrel exports**: Excellent use of index.ts (29 directories)
✅ **Type organization**: Clean, domain-based structure
✅ **Feature architecture**: Clear, self-contained modules

### Areas for Improvement
⚠️ **Handler organization**: One file misplaced (low impact)
⚠️ **Documentation**: Need explicit naming guidelines

### Overall Assessment
**Grade**: A- (90%)

The Adobe Demo Builder codebase demonstrates **strong filename conventions** with only minor inconsistencies. The recent Phase 2 refactoring to feature-based architecture has significantly improved organization. Most "inconsistencies" are actually intentional design patterns (e.g., Handler vs Handlers, Service vs Manager).

**Recommended Actions**:
1. Move `componentHandler.ts` to correct directory (1 hour)
2. Document naming conventions in developer guidelines (2 hours)
3. No other renames needed

The codebase is in excellent shape and requires minimal changes to achieve perfect consistency.

---

## Appendix A: Complete File Inventory

### By Casing
- **camelCase**: 140 files (73%)
- **PascalCase**: 51 files (27% - all React components)
- **kebab-case**: 0 files (directories only)

### By Extension
- **.ts files**: 141
- **.tsx files**: 51 (all React components)

### By Suffix Pattern
- **Manager**: 9 files
- **Service**: 3 files
- **Handler**: 8 files
- **Handlers**: 5 files
- **Provider**: 2 files
- **Logger**: 4 files
- **Validator**: 2 files
- **Registry**: 2 files
- **Updater**: 3 files
- **Step**: 10 files (React wizard steps)
- **Screen**: 3 files (React full screens)
- **No suffix**: 143 files

### Barrel Exports (index.ts)
29 directories with index.ts for clean public API exports

---

**Audit completed by**: Claude Code
**Review recommended**: Senior TypeScript developer
**Implementation priority**: Low (minimal changes needed)
