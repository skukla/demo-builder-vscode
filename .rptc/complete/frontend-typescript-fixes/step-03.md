# Step 3: Fix Missing DemoProject Type

## Objective

Resolve the missing `DemoProject` type export in `webview-ui/src/configure/ConfigureScreen.tsx`, fixing **1 error**.

## Error Addressed

```
webview-ui/src/configure/ConfigureScreen.tsx(10,45): error TS2305: Module '"@/webview-ui/shared/types"' has no exported member 'DemoProject'.
```

## Root Cause Analysis

`ConfigureScreen.tsx` line 10 imports:
```typescript
import { ComponentEnvVar, ComponentConfigs, DemoProject } from '@/webview-ui/shared/types';
```

But `webview-ui/src/shared/types/index.ts` does **not** export a `DemoProject` type.

**Possible scenarios:**
1. `DemoProject` is defined in backend types (`@/types`) but not re-exported in frontend types
2. `DemoProject` should be imported from `@/types` directly instead of `@/webview-ui/shared/types`
3. `DemoProject` doesn't exist and should use a different type (e.g., `Project`)

## Investigation Required

Before implementation, investigate where `DemoProject` is actually defined:

```bash
# Search for DemoProject type definition
grep -r "type DemoProject" src/
grep -r "interface DemoProject" src/

# Check backend types
grep -r "DemoProject" src/types/

# Check how ConfigureScreen actually uses it
grep -A 5 "project:" webview-ui/src/configure/ConfigureScreen.tsx
```

Expected findings:
- `DemoProject` likely defined in `src/types/` (backend)
- May be an alias for `Project` with additional demo-specific properties
- ConfigureScreen receives `project` prop of this type

## Implementation Options

### Option A: Import DemoProject from Backend Types

If `DemoProject` is defined in `@/types`:

```typescript
// BEFORE:
import { ComponentEnvVar, ComponentConfigs, DemoProject } from '@/webview-ui/shared/types';

// AFTER:
import { ComponentEnvVar, ComponentConfigs } from '@/webview-ui/shared/types';
import type { DemoProject } from '@/types';
```

**Rationale**: Frontend shouldn't re-export backend types (we removed this in Step 1). Import directly from source.

### Option B: Add DemoProject to Frontend Types

If `DemoProject` is frontend-specific and should be defined in shared types:

```typescript
// In webview-ui/src/shared/types/index.ts:

import type { Project } from '@/types';

export interface DemoProject extends Project {
    // Demo-specific properties
    demoId?: string;
    demoStatus?: 'running' | 'stopped' | 'error';
    // ... other demo-specific fields
}
```

**Rationale**: If there are demo-specific fields not in the base `Project` type, define a frontend-specific extension.

### Option C: Use Project Instead of DemoProject

If `DemoProject` is just an alias for `Project`:

```typescript
// In webview-ui/src/configure/ConfigureScreen.tsx:

// BEFORE:
import { ComponentEnvVar, ComponentConfigs, DemoProject } from '@/webview-ui/shared/types';

interface ConfigureScreenProps {
    project: DemoProject;
    componentsData: any;
}

// AFTER:
import { ComponentEnvVar, ComponentConfigs } from '@/webview-ui/shared/types';
import type { Project } from '@/types';

interface ConfigureScreenProps {
    project: Project;
    componentsData: any;
}
```

**Rationale**: Use the actual backend type instead of creating unnecessary aliases.

## Recommended Approach

**Start with Option A** (import from backend types), as this aligns with the pattern established in Step 1 (no circular re-exports of backend types in frontend).

**Steps:**
1. Search codebase for `DemoProject` definition
2. If found in `@/types`, use Option A
3. If not found, check if `Project` type suffices (Option C)
4. Only if frontend needs demo-specific extensions, use Option B

## Detailed Implementation

### Step 1: Investigate DemoProject Definition

```bash
# Find where DemoProject is defined
rg "type DemoProject|interface DemoProject" src/

# Check ConfigureScreen usage
grep -B 5 -A 10 "project:" webview-ui/src/configure/ConfigureScreen.tsx | head -20
```

### Step 2: Apply Fix Based on Findings

**If DemoProject exists in src/types/:**

```typescript
// File: webview-ui/src/configure/ConfigureScreen.tsx (line 10)

// BEFORE:
import { ComponentEnvVar, ComponentConfigs, DemoProject } from '@/webview-ui/shared/types';

// AFTER:
import { ComponentEnvVar, ComponentConfigs } from '@/webview-ui/shared/types';
import type { DemoProject } from '@/types';
```

**If DemoProject doesn't exist, use Project:**

```typescript
// File: webview-ui/src/configure/ConfigureScreen.tsx

// BEFORE:
import { ComponentEnvVar, ComponentConfigs, DemoProject } from '@/webview-ui/shared/types';

interface ConfigureScreenProps {
    project?: DemoProject;
    // ...
}

// AFTER:
import { ComponentEnvVar, ComponentConfigs } from '@/webview-ui/shared/types';
import type { Project } from '@/types';

interface ConfigureScreenProps {
    project?: Project;
    // ...
}

// Also update all usages of DemoProject in the file to Project
```

### Step 3: Verify No Other Files Use DemoProject

```bash
# Check if other files import DemoProject
grep -r "DemoProject" webview-ui/src/

# If found, apply same fix to those files
```

## Test Strategy

### Pre-Implementation Test
```bash
# Verify error exists
npm run compile:webview 2>&1 | grep "ConfigureScreen.*DemoProject"
# Expected: 1 error
```

### Post-Implementation Test
```bash
# Test: TypeScript compilation
npm run compile:webview

# Expected: 1 fewer error
# Verify: No error about DemoProject in ConfigureScreen.tsx
```

### Manual Test
```bash
# Build webview to ensure webpack resolves types correctly
npm run build:webview
```

## Acceptance Criteria

- [ ] `DemoProject` type properly imported (either from `@/types` or redefined in frontend types)
- [ ] `ConfigureScreen.tsx` compiles without error on line 10
- [ ] TypeScript error count reduced by 1
- [ ] No NEW errors introduced
- [ ] All usages of `project` prop in ConfigureScreen maintain correct typing

## Estimated Time

**5 minutes** (single import fix, unless DemoProject needs to be defined)

## Risk Level

**Low** - Simple import fix. If DemoProject needs to be defined, slightly higher risk but still straightforward.

## Dependencies

- **Depends on**: Step 1 (removed circular type exports, so must import from source)
- **Blocks**: None

## Notes

- This error highlights the importance of clear type ownership (backend types in `@/types`, frontend types in `@/webview-ui/shared/types`)
- The fix reinforces the pattern: frontend imports backend types when needed, but doesn't re-export them
- If `DemoProject` is extensively used in ConfigureScreen, verify the type matches all usages (may need to define with correct shape)
