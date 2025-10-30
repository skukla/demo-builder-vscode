# Step 2: Convert src/ Root Level (extension.ts)

**Purpose:** Convert extension.ts to use path aliases for cross-boundary imports, establishing pattern for subsequent conversions

**Prerequisites:**
- [x] Step 1 completed (broken import fixed, @/commands/* alias added)
- [x] All Step 1 tests passing
- [x] TypeScript compilation succeeds

**Tests to Write First:**

- [x] Test: extension.ts compiles with path aliases
  - **Given:** extension.ts imports converted to path aliases
  - **When:** Run TypeScript compilation
  - **Then:** Compilation succeeds with zero NEW errors (baseline: 9 pre-existing errors)
  - **File:** N/A (compilation test)

- [x] Test: Extension activates successfully
  - **Given:** extension.ts uses path aliases
  - **When:** Launch extension in debug mode (F5)
  - **Then:** Extension activates, logs show "Ready" message
  - **File:** N/A (runtime test - manual verification recommended)

**Files to Create/Modify:**

- [x] `src/extension.ts` - Convert cross-boundary imports to path aliases

**Implementation Details:**

**RED Phase** (Identify imports to convert):

```bash
# Show current imports in extension.ts
grep "^import" src/extension.ts

# Expected imports to convert:
# - import { parseJSON } from './types/typeGuards'; (cross-boundary: types)
# - import { AutoUpdater } from './utils/autoUpdater'; (cross-boundary: utils)
```

**GREEN Phase** (Convert to path aliases):

**File:** `src/extension.ts`

**Imports to Convert:**

1. **Line 7:**
   ```typescript
   // BEFORE
   import { parseJSON } from './types/typeGuards';

   // AFTER
   import { parseJSON } from '@/types/typeGuards';
   ```
   **Reason:** Cross-boundary (root → types)

2. **Line 8:**
   ```typescript
   // BEFORE
   import { AutoUpdater } from './utils/autoUpdater';

   // AFTER
   import { AutoUpdater } from '@/utils/autoUpdater';
   ```
   **Reason:** Cross-boundary (root → utils)

**Imports to KEEP (already using aliases or within-boundary):**

- Line 2: `import { BaseWebviewCommand } from '@/core/base';` ✅ Already alias
- Line 4: `import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';` ✅ Already alias
- Line 5: `import { StatusBarManager } from '@/core/vscode/StatusBarManager';` ✅ Already alias
- Line 6: `import { ServiceLocator } from '@/core/di';` ✅ Already alias
- Line 9: `import { CommandExecutor } from '@/core/shell';` ✅ Already alias
- Line 10: `import { initializeLogger, Logger } from '@/core/logging';` ✅ Already alias
- Line 11: `import { StateManager } from '@/core/state';` ✅ Already alias

**Complete Transformation:**

```typescript
// src/extension.ts (lines 1-11)
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import { CommandManager } from './commands/commandManager';
import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { ServiceLocator } from '@/core/di';
import { parseJSON } from '@/types/typeGuards';  // ✅ CHANGED
import { AutoUpdater } from '@/utils/autoUpdater';  // ✅ CHANGED
import { CommandExecutor } from '@/core/shell';
import { initializeLogger, Logger } from '@/core/logging';
import { StateManager } from '@/core/state';
```

**Note:** `./commands/commandManager` is kept as relative because it's a same-level import (root → root/commands), not strictly cross-boundary. However, we could convert it to `@/commands/commandManager` for consistency since we added the alias. Let's convert it:

```typescript
import { CommandManager } from '@/commands/commandManager';  // ✅ CHANGED
```

**REFACTOR Phase** (Verify and optimize):

1. **Verify import order** (ESLint import/order rule)
   ```bash
   # Check if imports are in correct order
   npm run lint src/extension.ts
   ```

2. **Compile and verify**
   ```bash
   # Verify TypeScript compilation succeeds
   npm run build
   ```

3. **Runtime test**
   ```bash
   # Launch extension in debug mode
   # Press F5 in VS Code
   # Check Debug Console for "Ready" message
   # Check for any errors
   ```

**Expected Outcome:**

- extension.ts imports use path aliases for cross-boundary imports
- TypeScript compilation succeeds with zero errors
- Extension activates successfully in debug mode
- No functional changes (extension works identically)

**Acceptance Criteria:**

- [x] All tests passing for this step (no NEW errors introduced)
- [x] TypeScript compilation succeeds with baseline error count unchanged (9 errors)
- [x] Extension activates successfully (F5) - manual verification recommended
- [x] All imports use path aliases (no relative imports remaining in extension.ts)
- [x] ESLint passes (import order correct)
- [x] No console.log or debugger statements
- [x] Git diff shows only import statement changes

**Estimated Time:** 0.5 hours

---

## Verification Commands

```bash
# 1. Verify imports converted
grep "from '@/" src/extension.ts | wc -l  # Should be 10 (all imports except vscode)

# 2. Verify no relative imports remain
grep "from '\\./" src/extension.ts  # Should be empty

# 3. Verify compilation succeeds
npm run build && echo "✅ Compilation succeeded"

# 4. Verify ESLint passes
npx eslint src/extension.ts
```

## Commit Message

```
refactor: convert extension.ts to path aliases

- Convert relative imports to path aliases (@/types, @/utils, @/commands)
- Maintain import ordering per ESLint rules
- Zero functional changes (pure refactoring)

Part of path alias conversion (Step 2/10)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```
