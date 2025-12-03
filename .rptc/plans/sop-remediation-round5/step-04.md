# Step 4: Create `getComponentVersion()` Helper

## Purpose

Create a helper function to extract component version from project, replacing deep optional chaining per SOP §4.

## Files to Modify

- `src/types/typeGuards.ts` - Add helper
- `src/features/updates/services/updateManager.ts:68` - Use helper

## Tests to Write First

**Required tests** for new helper:

```typescript
describe('getComponentVersion', () => {
    it('should return version when component exists', () => {
        const project = {
            componentVersions: {
                'citisignal-nextjs': { version: '1.2.3' }
            }
        } as Project;
        expect(getComponentVersion(project, 'citisignal-nextjs')).toBe('1.2.3');
    });

    it('should return undefined for undefined project', () => {
        expect(getComponentVersion(undefined, 'citisignal-nextjs')).toBeUndefined();
    });

    it('should return undefined for null project', () => {
        expect(getComponentVersion(null, 'citisignal-nextjs')).toBeUndefined();
    });

    it('should return undefined when component not found', () => {
        const project = {
            componentVersions: {
                'other-component': { version: '1.0.0' }
            }
        } as Project;
        expect(getComponentVersion(project, 'citisignal-nextjs')).toBeUndefined();
    });

    it('should return undefined when componentVersions is undefined', () => {
        const project = {} as Project;
        expect(getComponentVersion(project, 'citisignal-nextjs')).toBeUndefined();
    });
});
```

## Implementation

Add to typeGuards.ts:
```typescript
/**
 * Get the installed version of a component from a project
 * @param project - The project to check
 * @param componentId - The component ID to look up
 * @returns The version string or undefined if not found
 */
export function getComponentVersion(
    project: Project | undefined | null,
    componentId: string,
): string | undefined {
    return project?.componentVersions?.[componentId]?.version;
}
```

Update updateManager.ts to use helper.

## Expected Outcome

- `getComponentVersion()` exported from typeGuards.ts
- Full test coverage for helper
- updateManager.ts uses helper instead of deep chaining

## Acceptance Criteria

- [ ] getComponentVersion() function implemented
- [ ] All 5 test cases pass
- [ ] updateManager.ts uses the helper
- [ ] All existing tests pass
