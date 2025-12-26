# Step 2: Update TypeScript Types

## Purpose

Add missing fields to the `DemoTemplate` interface so TypeScript types accurately reflect the actual `templates.json` structure. This ensures type safety when working with templates that have `stack`, `brand`, `source`, and `submodules` fields.

## Prerequisites

- [ ] Step 1 complete (import paths fixed)

## Tests to Write First

- [ ] **Test: DemoTemplate accepts stack field**
  - Given: A template object with `stack: "headless-paas"`
  - When: Assigned to DemoTemplate type
  - Then: TypeScript compiles without error
  - File: `tests/unit/types/templates.test.ts`

- [ ] **Test: DemoTemplate accepts source field**
  - Given: A template with `source: { type: "git", url: "...", branch: "main" }`
  - When: Assigned to DemoTemplate type
  - Then: TypeScript compiles without error
  - File: `tests/unit/types/templates.test.ts`

- [ ] **Test: DemoTemplate accepts submodules field**
  - Given: A template with `submodules: { "name": { path: "...", repository: "..." } }`
  - When: Assigned to DemoTemplate type
  - Then: TypeScript compiles without error
  - File: `tests/unit/types/templates.test.ts`

## Files to Create/Modify

- [ ] `src/types/templates.ts` - Add missing interface fields

## Implementation Details

### RED Phase

```typescript
// tests/unit/types/templates.test.ts
import { DemoTemplate } from '@/types/templates';

describe('DemoTemplate type', () => {
  it('accepts stack field', () => {
    const template: DemoTemplate = {
      id: 'test',
      name: 'Test',
      description: 'Test template',
      stack: 'headless-paas',
      defaults: {}
    };
    expect(template.stack).toBe('headless-paas');
  });

  it('accepts source field with git options', () => {
    const template: DemoTemplate = {
      id: 'test',
      name: 'Test',
      description: 'Test',
      source: {
        type: 'git',
        url: 'https://github.com/example/repo',
        branch: 'main',
        gitOptions: { shallow: true, recursive: false }
      },
      defaults: {}
    };
    expect(template.source?.type).toBe('git');
  });

  it('accepts submodules field', () => {
    const template: DemoTemplate = {
      id: 'test',
      name: 'Test',
      description: 'Test',
      submodules: {
        'demo-inspector': { path: 'src/inspector', repository: 'org/repo' }
      },
      defaults: {}
    };
    expect(template.submodules).toBeDefined();
  });
});
```

### GREEN Phase

Add to `src/types/templates.ts`:

```typescript
export interface TemplateGitOptions {
  shallow?: boolean;
  recursive?: boolean;
}

export interface TemplateSource {
  type: string;
  url: string;
  branch: string;
  gitOptions?: TemplateGitOptions;
}

export interface TemplateSubmodule {
  path: string;
  repository: string;
}

export interface DemoTemplate {
  // ... existing fields ...

  /** Stack reference (from stacks.json) */
  stack?: string;
  /** Brand reference (from brands.json) */
  brand?: string;
  /** Git source configuration */
  source?: TemplateSource;
  /** Submodule definitions */
  submodules?: Record<string, TemplateSubmodule>;
}
```

### REFACTOR Phase

- Verify all template-related code compiles with new types
- Run existing template tests to ensure backward compatibility

## Expected Outcome

- DemoTemplate interface matches templates.json structure
- TypeScript compilation succeeds for all template usage
- Existing tests continue to pass

## Acceptance Criteria

- [ ] All new type fields added to DemoTemplate
- [ ] New supporting interfaces created (TemplateSource, etc.)
- [ ] Type tests pass
- [ ] No breaking changes to existing code

## Dependencies from Other Steps

- Step 1: Import paths must be fixed first

## Estimated Time

30 minutes

---

**Step Status:** ✅ COMPLETE (2025-12-24)

**Completion Summary:**
- Added 3 new interfaces: `TemplateGitOptions`, `TemplateSource`, `TemplateSubmodule`
- Updated `DemoTemplate` with optional fields: `stack`, `brand`, `source`, `submodules`
- Made `defaults` optional for backward compatibility
- Created 17 type validation tests (all passing)

**Files Created:**
- `tests/types/templates.test.ts` (306 lines, 17 tests)

**Files Modified:**
- `src/types/templates.ts` (106 lines)

**Next Step:** Step 3 - Create templates.json validation tests
