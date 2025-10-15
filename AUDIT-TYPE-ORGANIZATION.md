# Type Organization Audit Report

**Date**: 2025-10-15
**Auditor**: Claude Code
**Scope**: All TypeScript type definitions in `src/`

## Executive Summary

This audit analyzed type organization across the Adobe Demo Builder codebase. The extension has undergone a significant refactoring from `utils/` to feature-based architecture, and while type organization is generally sound, there are opportunities for consolidation, cleanup, and improved organization.

**Key Findings:**
- **8 global type files** in `src/types/` (well organized)
- **2 feature-local type files** (authentication, prerequisites inline)
- **1 shared type file** (command-execution)
- **~30 files with inline type definitions** (mostly appropriate)
- **3 significant duplications** requiring consolidation
- **4-6 orphaned types** (unused, can be deleted)
- **Naming conflicts**: `MessageHandler` defined twice with different signatures

**Overall Health**: 🟢 Good - Type organization is solid with room for targeted improvements.

---

## 1. Type Inventory

### Global Types (`src/types/`)

| File | Type Count | Purpose | Category | Status |
|------|-----------|---------|----------|--------|
| `base.ts` | 14 types | Core domain types (Project, Component, etc.) | Global | ✅ Appropriate |
| `components.ts` | 11 types | Component registry & definitions | Global | ✅ Appropriate |
| `messages.ts` | 15 types | Webview ↔ Extension message protocol | Global | ✅ Appropriate |
| `handlers.ts` | 8 types | Message handler context & responses | Global | ✅ Appropriate |
| `state.ts` | 5 types | State management interfaces | Global | ✅ Appropriate |
| `logger.ts` | 4 types | Logging interfaces | Global | ✅ Appropriate |
| `typeGuards.ts` | 17 functions | Runtime type checking | Global | ✅ Appropriate |
| `index.ts` | - | Re-exports with conflict documentation | Global | ✅ Appropriate |

**Total**: 74 exported types/functions in global types directory

**Usage Analysis**:
- `@/types` imports: 44 occurrences across 31 files ✅ High usage
- `../types` imports: 14 occurrences across 13 files ✅ Moderate usage

### Feature-Local Types

| Feature | File | Type Count | Exported | Status |
|---------|------|-----------|----------|--------|
| `authentication/` | `services/types.ts` | 11 types | ✅ Yes | ✅ Appropriate |
| `prerequisites/` | `prerequisitesManager.ts` (inline) | 9 types | ✅ Yes | ⚠️ Should extract to types.ts |
| `updates/` | `updateManager.ts` (inline) | 2 types | ✅ Yes | ⚠️ Should extract to types.ts |
| `mesh/` | Multiple service files (inline) | 4 types | ✅ Yes | ⚠️ Should extract to types.ts |
| `components/` | `componentManager.ts` (inline) | 2 types | ✅ Yes | ⚠️ Should extract to types.ts |

**Total**: ~28 feature-specific types (11 in dedicated file, 17 inline)

### Shared Types

| Module | File | Type Count | Status |
|--------|------|-----------|--------|
| `command-execution/` | `types.ts` | 6 types | ✅ Appropriate |
| `communication/` | Inline in service | 1 type (private) | ✅ Appropriate |
| `logging/` | Inline in services | 2 types (private) | ✅ Appropriate |
| `validation/` | `fieldValidation.ts` | 1 type | ✅ Appropriate |

**Total**: 10 shared infrastructure types

### Webview Types

| File | Type Count | Purpose | Status |
|------|-----------|---------|--------|
| `webviews/types/index.ts` | 22 types | UI-specific types | ✅ Appropriate (UI layer) |

**Duplication Note**: Some types duplicate `src/types/base.ts` types (e.g., `ComponentInstance`, `AdobeConfig`, `CommerceConfig`). See Section 2.

---

## 2. Type Duplication Report

### CRITICAL: Duplicate Domain Types (Extension vs Webview)

**Problem**: Core domain types are defined in **both** `src/types/base.ts` and `src/webviews/types/index.ts`.

#### Duplicated Types:

| Type Name | Extension Location | Webview Location | Differences |
|-----------|-------------------|------------------|-------------|
| `ComponentInstance` | `src/types/base.ts:61-77` | `src/webviews/types/index.ts:121-137` | Identical structure |
| `AdobeConfig` | `src/types/base.ts:109-115` | `src/webviews/types/index.ts:88-94` (`AdobeProjectConfig`) | Same data, different name |
| `CommerceConfig` | `src/types/base.ts:117-138` | `src/webviews/types/index.ts:97-118` (`CommerceProjectConfig`) | Identical structure |
| `ProjectTemplate` | `src/types/base.ts:93-97` | `src/webviews/types/index.ts:62` | Identical union |
| `ComponentSelection` | `src/types/components.ts:202-210` | `src/webviews/types/index.ts:251-259` | Nearly identical |

**Impact**:
- Maintenance burden (update in 2 places)
- Type inconsistencies over time
- Confusion about canonical source

**Recommendation**:
```typescript
// OPTION 1: Webview imports from extension types (if build supports it)
// webviews/types/index.ts
export type { ComponentInstance, ProjectTemplate } from '@/types';
export type { AdobeConfig as AdobeProjectConfig } from '@/types';

// OPTION 2: Keep separate but document relationship
// webviews/types/index.ts
/**
 * ComponentInstance - UI layer representation
 *
 * NOTE: This mirrors src/types/base.ts ComponentInstance.
 * Keep in sync when updating domain model.
 */
export interface ComponentInstance { ... }
```

**Priority**: 🔴 Critical - Address during next refactor

---

### HIGH: MessageHandler Type Conflict

**Problem**: `MessageHandler` is defined **twice** with **different signatures**.

#### Conflicting Definitions:

**1. Webview Communication Handler** (`src/types/messages.ts:211-213`):
```typescript
export type MessageHandler<P = MessagePayload, R = MessageResponse> = (
    payload: P
) => Promise<R> | R;
```

**2. Command Handler** (`src/types/handlers.ts:186-189`):
```typescript
export type MessageHandler<P = unknown, R = HandlerResponse> = (
    context: HandlerContext,
    payload?: P
) => Promise<R>;
```

**Current Workaround**: `src/types/index.ts:53-57` documents the conflict:
```typescript
// Note: MessageHandler from messages is for webview communication
// MessageHandler from handlers is for command handlers
// Import them explicitly when needed with:
//   import { MessageHandler } from './types/messages' (for webview)
//   import { MessageHandler } from './types/handlers' (for command handlers)
```

**Impact**:
- Naming collision requires explicit imports
- Confusing for new developers
- IDE autocomplete suggests wrong type

**Recommendation**:
```typescript
// Rename to be specific
// src/types/messages.ts
export type WebviewMessageHandler<P = MessagePayload, R = MessageResponse> = ...

// src/types/handlers.ts
export type CommandMessageHandler<P = unknown, R = HandlerResponse> = ...

// Or keep MessageHandler in handlers.ts (more common) and rename messages one
export type MessageCallback<P = MessagePayload, R = MessageResponse> = ...
```

**Priority**: 🟠 High - Causes confusion and requires workarounds

---

### MEDIUM: Result Type Pattern Duplication

**Problem**: Multiple `*Result` interfaces with similar structures.

| Type | Location | Structure | Usage |
|------|----------|-----------|-------|
| `ValidationResult` | `src/types/base.ts:148-152` | `{ valid, errors[], warnings[] }` | 0 imports ❌ |
| `CommandResult` | `src/shared/command-execution/types.ts:10-15` | `{ stdout, stderr, code, duration }` | Used widely ✅ |
| `UpdateCheckResult` | `src/features/updates/services/updateManager.ts:15` | `{ hasUpdate, version?, downloadUrl?, ... }` | Feature-local ✅ |
| `MeshDeploymentResult` | `src/features/mesh/services/meshDeployment.ts:12` | `{ success, endpoint?, error? }` | Feature-local ✅ |
| `ComponentInstallResult` | `src/features/components/services/componentManager.ts:13` | `{ success, message?, error? }` | Feature-local ✅ |
| `CompatibilityCheckResult` | `src/types/components.ts:225-230` | `{ compatible, recommended?, notes?, ... }` | 0 imports ❌ |

**Analysis**:
- Feature-local `*Result` types are **appropriate** (domain-specific)
- `ValidationResult` and `CompatibilityCheckResult` are **orphaned** (see Section 3)
- No consolidation needed - different purposes

**Recommendation**: Delete orphaned types (see Section 3), keep feature-local results.

**Priority**: 🟡 Low - Acceptable pattern, orphans need cleanup

---

### MEDIUM: Config Type Pattern Duplication

**Problem**: Multiple `*Config` interfaces (mostly appropriate, some overlap).

| Type | Location | Purpose | Status |
|------|----------|---------|--------|
| `AdobeConfig` | `src/types/base.ts:109-115` | Extension domain model | ✅ Global |
| `AdobeProjectConfig` | `src/webviews/types/index.ts:88-94` | UI representation | ⚠️ Duplicate |
| `CommerceConfig` | `src/types/base.ts:117-138` | Extension domain model | ✅ Global |
| `CommerceProjectConfig` | `src/webviews/types/index.ts:97-118` | UI representation | ⚠️ Duplicate |
| `ComponentConfiguration` | `src/types/base.ts:206-221` | Component metadata | ✅ Global |
| `ApiServicesConfig` | `src/types/handlers.ts:86-114` | API services structure | ✅ Global |
| `PrerequisitesConfig` | `src/features/prerequisites/prerequisitesManager.ts:87` | Prerequisites metadata | ✅ Feature-local |
| `ProjectConfig` | `src/types/handlers.ts:26-42` | Legacy project structure | ⚠️ Deprecated |
| `CommandConfig` | `src/shared/command-execution/types.ts:76-81` | Command sequencing | ✅ Shared |
| `WizardStepConfig` | `src/shared/logging/stepLogger.ts:8` | Step metadata (private) | ✅ Internal |
| `ConfigField` | `src/types/base.ts:198-204` | Field definition | ✅ Global |

**Analysis**:
- Extension vs Webview duplication (see first duplication issue)
- Most configs are appropriately scoped
- `ProjectConfig` marked as legacy but still exported

**Recommendation**:
1. Address Extension/Webview duplication (see above)
2. Deprecate or remove `ProjectConfig` from `src/types/handlers.ts`

**Priority**: 🟡 Medium - Mostly acceptable

---

## 3. Orphaned Types

### Confirmed Orphaned (Zero Imports)

| Type | Location | Lines | Reason | Action |
|------|----------|-------|--------|--------|
| `ValidationResult` | `src/types/base.ts:148-152` | 5 | 0 imports found | ❌ **DELETE** |
| `CompatibilityInfo` | `src/types/base.ts:223-227` | 5 | 0 imports found | ❌ **DELETE** |
| `WizardStep` | `src/types/base.ts:270-277` | 8 | 0 imports found | ❌ **DELETE** |
| `CompatibilityCheckResult` | `src/types/components.ts:225-230` | 6 | 0 imports found | ❌ **DELETE** |

**Impact**: 4 types × ~6 lines each = **~24 lines** of dead code

**Note**: There's a `WizardStep` type in `webviews/types/index.ts` that **is** used - this is a different type.

---

### Likely Orphaned (Minimal Usage)

| Type | Location | Usage | Reason | Action |
|------|----------|-------|--------|--------|
| `UpdateInfo` | `src/types/base.ts:236-243` | 1 import (autoUpdater.ts - legacy) | Legacy auto-updater (deprecated) | ⏸️ **Mark Deprecated** |
| `ProjectConfig` | `src/types/handlers.ts:26-42` | Comment says "Legacy" | Kept for backward compatibility | ⏸️ **Mark Deprecated** |
| `StateData` | `src/types/base.ts:229-234` | Not directly imported | Internal state structure | ✅ **Keep** (used in StateManager impl) |
| `Prerequisites` | `src/types/base.ts:245-268` | Not directly imported | Used internally | ✅ **Keep** (structure definition) |

**Recommendation**: Add `@deprecated` JSDoc comments with migration path.

---

## 4. Misplaced Types

### Should Move: Feature-Local Types in Service Files

**Problem**: Feature-specific types defined inline in service files instead of dedicated `types.ts`.

#### Prerequisites Feature

**Current**:
```
features/prerequisites/services/
└── prerequisitesManager.ts (9 exported types inline)
```

**Should Be**:
```
features/prerequisites/services/
├── types.ts (9 types)
└── prerequisitesManager.ts (imports from ./types)
```

**Types to Extract**:
- `PrerequisiteCheck`
- `ProgressMilestone`
- `InstallStep`
- `PrerequisiteInstall`
- `PrerequisitePlugin`
- `PrerequisiteDefinition`
- `ComponentRequirement`
- `PrerequisitesConfig`
- `PrerequisiteStatus`

**Priority**: 🟠 High - Follow feature architecture pattern

---

#### Updates Feature

**Current**:
```
features/updates/services/
└── updateManager.ts (2 exported types inline)
```

**Should Be**:
```
features/updates/services/
├── types.ts (2 types)
└── updateManager.ts (imports from ./types)
```

**Types to Extract**:
- `ReleaseInfo` (currently private, should be `interface ReleaseInfo`)
- `UpdateCheckResult`

**Priority**: 🟡 Medium - Small feature, less critical

---

#### Mesh Feature

**Current**:
```
features/mesh/services/
├── meshDeployment.ts (1 type: MeshDeploymentResult)
├── meshDeploymentVerifier.ts (1 type: MeshDeploymentResult - duplicate name!)
├── meshVerifier.ts (1 type: MeshVerificationResult)
└── stalenessDetector.ts (inline types)
```

**Should Be**:
```
features/mesh/services/
├── types.ts (all mesh-related types)
├── meshDeployment.ts (imports from ./types)
├── meshDeploymentVerifier.ts (imports from ./types)
├── meshVerifier.ts (imports from ./types)
└── stalenessDetector.ts (imports from ./types)
```

**Types to Extract**:
- `MeshDeploymentResult` (2 services define this - consolidate!)
- `MeshVerificationResult`
- Any types from stalenessDetector.ts

**Priority**: 🟠 High - Has duplicate type names across files

---

#### Components Feature

**Current**:
```
features/components/services/
└── componentManager.ts (2 types inline)
```

**Should Be**:
```
features/components/services/
├── types.ts (2 types)
└── componentManager.ts (imports from ./types)
```

**Types to Extract**:
- `ComponentInstallOptions`
- `ComponentInstallResult`

**Priority**: 🟡 Medium - Small feature

---

### Correctly Placed Types

These feature-local types are **already** in dedicated `types.ts` files ✅:

| Feature | Type File | Types | Status |
|---------|-----------|-------|--------|
| `authentication/` | `services/types.ts` | 11 types (AdobeOrg, AdobeProject, etc.) | ✅ Correct |
| `command-execution/` (shared) | `types.ts` | 6 types | ✅ Correct |

---

## 5. Naming Inconsistencies

### Interface vs Type Alias Patterns

**Current State**: Mostly consistent use of `interface` for object shapes, `type` for unions/aliases ✅

**Examples**:
```typescript
// ✅ Correct: interface for object shape
export interface Project { ... }

// ✅ Correct: type for union
export type ComponentStatus = 'ready' | 'error' | ...

// ✅ Correct: type for alias
export type MessagePayload = PrerequisitePayload | AuthPayload | ...
```

**Finding**: Naming pattern is **consistent** and follows TypeScript best practices.

---

### Suffix Patterns

| Suffix | Count | Examples | Consistency |
|--------|-------|----------|-------------|
| `*Result` | 7 | `CommandResult`, `ValidationResult`, `UpdateCheckResult` | ✅ Consistent |
| `*Config` | 11 | `AdobeConfig`, `CommerceConfig`, `ProjectConfig` | ✅ Consistent |
| `*Payload` | 7 | `AuthPayload`, `ProjectPayload`, `ComponentPayload` | ✅ Consistent |
| `*State` | 4 | `WizardState`, `AdobeAuthState`, `SharedState` | ✅ Consistent |
| `*Handler` | 3 | `MessageHandler` (×2), `IComponentHandler` | ⚠️ `MessageHandler` conflict |
| `*Manager` | 0 | (Managers are classes, not types) | ✅ N/A |
| `*Definition` | 6 | `ComponentDefinition`, `PrerequisiteDefinition` | ✅ Consistent |
| `*Instance` | 2 | `ComponentInstance` | ✅ Consistent |

**Finding**: Suffix patterns are **highly consistent** with one exception (`MessageHandler` conflict).

---

### PascalCase Consistency

**Audit Result**: All type names use PascalCase ✅

**Examples**:
- `ComponentInstance` ✅
- `AdobeConfig` ✅
- `MessagePayload` ✅
- `PrerequisiteStatus` ✅

**No Issues Found**.

---

### Rename Recommendations

| Current Name | Location | Issue | Recommended Name | Impact |
|--------------|----------|-------|------------------|--------|
| `MessageHandler` (webview) | `src/types/messages.ts` | Conflicts with handlers.ts | `WebviewMessageHandler` or `MessageCallback` | 12 imports |
| `MessageHandler` (command) | `src/types/handlers.ts` | Conflicts with messages.ts | Keep as `MessageHandler` (more common) | 28 imports |
| `AdobeProjectConfig` | `webviews/types/index.ts` | Inconsistent with `AdobeConfig` | Use `AdobeConfig` directly (if possible) | Webview-only |
| `CommerceProjectConfig` | `webviews/types/index.ts` | Inconsistent with `CommerceConfig` | Use `CommerceConfig` directly (if possible) | Webview-only |

**Priority**: 🟠 High for `MessageHandler`, 🟡 Medium for webview config names

---

## 6. Missing Types

### Where `any` is Used Instead of Proper Type

**Search Strategy**: Look for `any` in function signatures, return types, and parameters.

#### High-Priority Missing Types

None found in type definitions themselves (types are well-defined) ✅

**Note**: Type usage in implementation files not audited (out of scope for this type organization audit).

---

### Where Inline Types Should Be Extracted

**Already Covered in Section 4** (Misplaced Types).

Summary:
- Prerequisites feature: 9 types inline → extract to `types.ts`
- Updates feature: 2 types inline → extract to `types.ts`
- Mesh feature: 4 types inline → extract to `types.ts`
- Components feature: 2 types inline → extract to `types.ts`

---

### Where Feature `types.ts` is Missing

| Feature | Has `types.ts`? | Types Defined | Recommendation |
|---------|----------------|---------------|----------------|
| `authentication/` | ✅ Yes | `services/types.ts` (11 types) | ✅ No action needed |
| `prerequisites/` | ❌ No | 9 inline in service | 🔴 **CREATE** `services/types.ts` |
| `updates/` | ❌ No | 2 inline in service | 🟠 **CREATE** `services/types.ts` |
| `mesh/` | ❌ No | 4+ inline across services | 🔴 **CREATE** `services/types.ts` |
| `components/` | ❌ No | 2 inline in service | 🟡 **CREATE** `services/types.ts` |
| `dashboard/` | ✅ N/A | No types needed | ✅ No action needed |
| `lifecycle/` | ✅ N/A | No types needed | ✅ No action needed |
| `project-creation/` | ⚠️ Partial | 1 inline in handler | 🟡 **CREATE** `types.ts` if grows |

**Priority**:
- 🔴 Critical: `prerequisites/`, `mesh/` (large features with many types)
- 🟠 High: `updates/`
- 🟡 Medium: `components/`, `project-creation/`

---

## 7. Recommendations

### Critical Priority (Address Immediately)

#### 1. Resolve Extension/Webview Type Duplication 🔴

**Problem**: `ComponentInstance`, `AdobeConfig`, `CommerceConfig`, etc. duplicated between extension and webview.

**Action Plan**:

**Option A: Shared Types (Ideal)**
```typescript
// If webpack build supports cross-context imports
// webviews/types/index.ts
export type {
    ComponentInstance,
    ProjectTemplate,
    AdobeConfig,
    CommerceConfig
} from '@/types';
```

**Option B: Document Relationship (Pragmatic)**
```typescript
// webviews/types/index.ts
/**
 * ComponentInstance - UI representation
 *
 * IMPORTANT: Mirrors src/types/base.ts ComponentInstance
 * SYNC: Update both locations when domain model changes
 *
 * Duplication exists because webview bundle cannot import
 * from extension context. Keep in sync manually.
 */
export interface ComponentInstance { ... }
```

**Estimated Effort**: 2-4 hours
**Files Affected**: `webviews/types/index.ts`, possibly webpack config

---

#### 2. Resolve `MessageHandler` Naming Conflict 🔴

**Problem**: Two `MessageHandler` types with different signatures.

**Action Plan**:
```typescript
// src/types/messages.ts
// Rename to WebviewMessageHandler
export type WebviewMessageHandler<P = MessagePayload, R = MessageResponse> = (
    payload: P
) => Promise<R> | R;

// src/types/handlers.ts
// Keep as MessageHandler (more common usage - 28 imports vs 12)
export type MessageHandler<P = unknown, R = HandlerResponse> = (
    context: HandlerContext,
    payload?: P
) => Promise<R>;

// src/shared/communication/webviewCommunicationManager.ts
// Update to use WebviewMessageHandler
type MessageHandlerFunction<P = MessagePayload, R = unknown> = WebviewMessageHandler<P, R>;
```

**Estimated Effort**: 2 hours
**Files Affected**:
- `src/types/messages.ts`
- `src/shared/communication/webviewCommunicationManager.ts`
- ~12 files importing webview handler

---

#### 3. Delete Orphaned Types 🔴

**Action Plan**:
```typescript
// src/types/base.ts
// DELETE these unused types:
// - ValidationResult (lines 148-152)
// - CompatibilityInfo (lines 223-227)
// - WizardStep (lines 270-277)

// src/types/components.ts
// DELETE:
// - CompatibilityCheckResult (lines 225-230)
```

**Verification**: Search codebase for any usage before deleting.

**Estimated Effort**: 30 minutes
**Files Affected**: `src/types/base.ts`, `src/types/components.ts`

---

### High Priority (Address Next Sprint)

#### 4. Create Feature `types.ts` Files 🟠

**Action Plan**:

**Prerequisites Feature**:
```bash
# Create types file
touch src/features/prerequisites/services/types.ts

# Extract 9 types from prerequisitesManager.ts
# - PrerequisiteCheck
# - ProgressMilestone
# - InstallStep
# - PrerequisiteInstall
# - PrerequisitePlugin
# - PrerequisiteDefinition
# - ComponentRequirement
# - PrerequisitesConfig
# - PrerequisiteStatus
```

**Mesh Feature**:
```bash
# Create types file
touch src/features/mesh/services/types.ts

# Extract and consolidate types from:
# - meshDeployment.ts (MeshDeploymentResult)
# - meshDeploymentVerifier.ts (MeshDeploymentResult - duplicate!)
# - meshVerifier.ts (MeshVerificationResult)
# - stalenessDetector.ts (any inline types)
```

**Updates Feature**:
```bash
# Create types file
touch src/features/updates/services/types.ts

# Extract 2 types from updateManager.ts
# - ReleaseInfo
# - UpdateCheckResult
```

**Components Feature**:
```bash
# Create types file
touch src/features/components/services/types.ts

# Extract 2 types from componentManager.ts
# - ComponentInstallOptions
# - ComponentInstallResult
```

**Estimated Effort**: 4-6 hours
**Files Affected**: 4 new `types.ts` files, 6+ service files

---

#### 5. Deprecate Legacy Types 🟠

**Action Plan**:
```typescript
// src/types/handlers.ts
/**
 * @deprecated Legacy project configuration structure.
 * Use Project type from src/types/base.ts instead.
 * Will be removed in v2.0.
 */
export interface ProjectConfig { ... }

// src/types/base.ts
/**
 * @deprecated Legacy update info structure.
 * Replaced by UpdateCheckResult in features/updates/services/types.ts
 * Will be removed in v2.0.
 */
export interface UpdateInfo { ... }
```

**Estimated Effort**: 15 minutes
**Files Affected**: `src/types/handlers.ts`, `src/types/base.ts`

---

### Medium Priority (Next Quarter)

#### 6. Standardize Webview Type Naming 🟡

**Current**: `AdobeProjectConfig`, `CommerceProjectConfig`
**Global**: `AdobeConfig`, `CommerceConfig`

**Action**: Align naming or document reason for difference.

**Estimated Effort**: 1 hour
**Files Affected**: `webviews/types/index.ts`, webview components

---

#### 7. Create Type Architecture Documentation 🟡

**Action**: Document type organization standards in `docs/architecture/type-organization.md`

**Contents**:
- When to use global vs feature-local types
- Naming conventions
- Import patterns
- Type extraction guidelines

**Estimated Effort**: 2 hours
**Files Affected**: New documentation file

---

### Low Priority (Nice to Have)

#### 8. Type Re-export Optimization 🟢

**Current**: `src/types/index.ts` re-exports most types.

**Action**: Review what should be re-exported vs directly imported.

**Estimated Effort**: 1 hour
**Files Affected**: `src/types/index.ts`

---

## 8. Type Organization Standards

### Decision Tree: Where Should This Type Go?

```
┌─────────────────────────────────────────────┐
│ "I'm creating a new type. Where does it go?" │
└─────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Is it used by the     │
        │ webview UI layer?     │
        └───────────────────────┘
              │           │
           YES│           │NO
              │           │
              ▼           ▼
    ┌─────────────┐  ┌────────────────────┐
    │ webviews/   │  │ Is it used by 3+   │
    │ types/      │  │ modules/features?  │
    │ index.ts    │  └────────────────────┘
    └─────────────┘        │           │
                        YES│           │NO
                           │           │
                           ▼           ▼
                  ┌─────────────┐  ┌──────────────────┐
                  │ src/types/  │  │ Is it shared     │
                  │ (global)    │  │ infrastructure?  │
                  └─────────────┘  └──────────────────┘
                                         │           │
                                      YES│           │NO
                                         │           │
                                         ▼           ▼
                                ┌─────────────┐  ┌──────────────────┐
                                │ src/shared/ │  │ Feature-specific │
                                │ [module]/   │  │ src/features/    │
                                │ types.ts    │  │ [feature]/       │
                                └─────────────┘  │ services/types.ts│
                                                 └──────────────────┘
```

### Type Categories

#### Global Types (`src/types/*.ts`)

**When to Use**:
- Type is used by **3 or more** modules/features
- Type represents a **core domain concept** (Project, Component, etc.)
- Type is part of the **message protocol** (extension ↔ webview)
- Type defines **state shape** used across the extension

**Examples**:
- `Project` - Core domain entity used everywhere
- `Message`, `MessagePayload` - Communication protocol
- `StateManager` - Persistence interface
- `Logger` - Logging interface

**File Organization**:
```
src/types/
├── base.ts          # Core domain types (Project, Component, etc.)
├── components.ts    # Component registry & definitions
├── messages.ts      # Message protocol types
├── handlers.ts      # Handler context & response types
├── state.ts         # State management interfaces
├── logger.ts        # Logging interfaces
├── typeGuards.ts    # Runtime type checking
└── index.ts         # Re-exports
```

---

#### Feature-Local Types (`src/features/[feature]/services/types.ts`)

**When to Use**:
- Type is used **only within one feature**
- Type represents **feature-specific domain concepts**
- Type is **not exported** outside the feature

**Examples**:
- `AdobeOrg`, `AdobeProject` - Authentication feature concepts
- `PrerequisiteDefinition` - Prerequisites feature
- `MeshDeploymentResult` - Mesh feature
- `UpdateCheckResult` - Updates feature

**File Organization**:
```
features/authentication/
├── index.ts              # Public API (may export some types)
└── services/
    ├── types.ts          # 👈 Feature-local types
    └── authenticationService.ts

features/mesh/
├── index.ts
└── services/
    ├── types.ts          # 👈 Feature-local types
    ├── meshDeployment.ts
    └── meshVerifier.ts
```

**Export Rules**:
- Types used **only within feature services**: Keep in `types.ts`, don't export from `index.ts`
- Types exposed as **feature's public API**: Export from `index.ts`

---

#### Shared Types (`src/shared/[module]/types.ts`)

**When to Use**:
- Type is part of **shared infrastructure** (logging, state, communication, etc.)
- Type is used by **multiple features** but represents infrastructure, not domain
- Type is **generic** and reusable across different contexts

**Examples**:
- `CommandResult` - Command execution infrastructure
- `RetryStrategy` - Retry logic configuration
- `PollOptions` - Polling configuration
- `ExecuteOptions` - Command execution options

**File Organization**:
```
shared/command-execution/
├── index.ts               # Exports services + types
├── types.ts               # 👈 Infrastructure types
└── externalCommandManager.ts

shared/communication/
├── index.ts
├── types.ts               # 👈 Infrastructure types
└── webviewCommunicationManager.ts
```

---

#### Webview Types (`src/webviews/types/index.ts`)

**When to Use**:
- Type is used **only in React components** (UI layer)
- Type represents **UI state** (wizard state, form validation, etc.)
- Type is **UI-specific** and doesn't belong in extension domain

**Examples**:
- `WizardState` - React component state
- `WizardStep` - UI step enum
- `FeedbackMessage` - UI feedback structure
- `FormValidation` - UI validation result

**Duplication Note**: Some types duplicate extension types (e.g., `ComponentInstance`). This is necessary if webpack build doesn't support cross-context imports. Document the duplication and keep in sync.

---

#### Private/Internal Types (Inline in Implementation Files)

**When to Use**:
- Type is used **only within one file**
- Type is an **implementation detail**
- Type doesn't need to be tested or mocked

**Examples**:
```typescript
// commands/diagnostics.ts
interface CommandCheckResult {  // 👈 Private to this file
    installed: boolean;
    version?: string;
    error?: string;
}
```

**Guideline**: If a type is exported or used in more than one file, move it to a `types.ts` file.

---

### Import Patterns

#### ✅ Correct Import Patterns

```typescript
// Import global types from @/types
import { Project, ComponentInstance } from '@/types';

// Import feature-local types from feature's types.ts
import { AdobeOrg, AdobeProject } from '../services/types';

// Import shared types from shared module
import { CommandResult, ExecuteOptions } from '@/shared/command-execution';

// Import webview types from webview types
import { WizardState, WizardStep } from '../../types';
```

#### ❌ Incorrect Import Patterns

```typescript
// ❌ Don't import from feature in global types (circular dependency)
import { AdobeOrg } from '@/features/authentication';

// ❌ Don't import global types using relative path from deep files
import { Project } from '../../../../types';

// ❌ Don't import feature types from outside the feature
import { AdobeOrg } from '@/features/authentication/services/types';
// Instead: Feature should export it from index.ts if it's public API
```

---

### Type Naming Conventions

#### Interfaces vs Type Aliases

**Use `interface` for**:
- Object shapes
- Extensible types
- Class contracts

```typescript
export interface Project {
    name: string;
    path: string;
    status: ProjectStatus;
}
```

**Use `type` for**:
- Unions
- Intersections
- Aliases
- Complex types

```typescript
export type ComponentStatus = 'ready' | 'error' | 'running';
export type MessagePayload = AuthPayload | ProjectPayload;
```

#### Naming Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| `[Noun]` | Domain entities | `Project`, `Component`, `Prerequisite` |
| `[Noun]Definition` | Metadata/schema | `ComponentDefinition`, `PrerequisiteDefinition` |
| `[Noun]Instance` | Runtime instances | `ComponentInstance` |
| `[Noun]Config` | Configuration objects | `AdobeConfig`, `CommerceConfig` |
| `[Noun]State` | State objects | `WizardState`, `AuthState` |
| `[Verb]Result` | Operation results | `CommandResult`, `ValidationResult` |
| `[Verb]Options` | Operation options | `ExecuteOptions`, `PollOptions` |
| `[Context]Payload` | Message payloads | `AuthPayload`, `ProjectPayload` |
| `[Context]Handler` | Handler functions | `MessageHandler`, `EventHandler` |
| `I[Noun]` | Interfaces (sparingly) | `IComponentHandler` (for DI) |

**Avoid**:
- Generic names like `Data`, `Info`, `Item`
- Hungarian notation (`strName`, `objProject`)
- Abbreviations (`Cfg`, `Prereq`) unless widely understood

---

### Type Export Guidelines

#### What to Export from Global Types

✅ **Export**:
- Core domain types used widely
- Protocol types (messages, handlers)
- Public interfaces (StateManager, Logger)

❌ **Don't Export**:
- Implementation details
- Internal helper types
- Private type aliases

#### What to Export from Feature Types

✅ **Export**:
- Types needed by feature's public API
- Types used by feature tests
- Types that might be used by commands

❌ **Don't Export**:
- Internal service types
- Implementation details
- Types only used within feature services

**Example**:
```typescript
// features/authentication/services/types.ts
export interface AdobeOrg { ... }           // ✅ Export (public API)
export interface AdobeProject { ... }       // ✅ Export (public API)
export interface AuthToken { ... }          // ❌ Don't export (internal)
interface TokenCacheEntry { ... }           // ❌ Don't export (private)

// features/authentication/index.ts
export { AuthenticationService } from './services/authenticationService';
export type { AdobeOrg, AdobeProject } from './services/types';
// Note: AuthToken not re-exported (internal to feature)
```

---

### Migration Checklist

When refactoring type organization:

- [ ] Identify all types in the file/feature
- [ ] Categorize each type (global, feature-local, shared, webview, private)
- [ ] Check for duplicates across categories
- [ ] Create `types.ts` file if needed
- [ ] Move types to appropriate location
- [ ] Update imports in all consuming files
- [ ] Update exports in `index.ts` files
- [ ] Search for orphaned types (no imports)
- [ ] Add JSDoc comments for complex types
- [ ] Run TypeScript compiler (`tsc --noEmit`)
- [ ] Test affected features
- [ ] Update documentation

---

## Summary Statistics

| Metric | Count | Status |
|--------|-------|--------|
| **Global type files** | 8 | ✅ Well organized |
| **Feature-local type files** | 1 (should be 5) | ⚠️ Needs improvement |
| **Shared type files** | 1 | ✅ Good |
| **Total types defined** | ~120 | - |
| **Duplicated types** | 5-7 | ⚠️ Needs consolidation |
| **Orphaned types** | 4 confirmed | ❌ Delete |
| **Naming conflicts** | 1 (`MessageHandler`) | ❌ Resolve |
| **Misplaced types** | ~17 (inline in services) | ⚠️ Extract to types.ts |

---

## Conclusion

The Adobe Demo Builder's type organization is **generally sound** with clear separation between global, feature-local, and shared types. The recent refactoring to feature-based architecture has improved organization significantly.

**Key Strengths**:
- Well-organized global types in `src/types/`
- Consistent naming conventions
- Good use of type guards
- Clear separation of concerns

**Key Weaknesses**:
- Extension/Webview type duplication
- `MessageHandler` naming conflict
- Missing feature `types.ts` files
- Some orphaned types

**Next Steps** (in priority order):
1. 🔴 Resolve Extension/Webview duplication
2. 🔴 Fix `MessageHandler` naming conflict
3. 🔴 Delete orphaned types
4. 🟠 Create feature `types.ts` files (prerequisites, mesh, updates, components)
5. 🟠 Deprecate legacy types
6. 🟡 Document type organization standards

**Estimated Total Effort**: 12-16 hours to address all critical and high-priority items.

---

**End of Audit Report**
