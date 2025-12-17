# Step 10: Extract Array Aggregation Helper (Optional)

## Purpose

Extract repeated array aggregation pattern to helper function (borderline §8 violation).

**Priority**: LOW - This is optional and addresses a borderline case.

## Files to Modify

- `src/features/dashboard/ui/configure/ConfigureScreen.tsx:305-310`
- `src/features/components/services/ComponentRegistryManager.ts:275-280` (if same pattern)

## Tests to Write First

```typescript
describe('getAllComponentDefinitions', () => {
    it('should aggregate all component categories', () => {
        const data = {
            frontends: [{ id: 'f1' }],
            backends: [{ id: 'b1' }],
            dependencies: [{ id: 'd1' }],
            integrations: [],
            appBuilder: [{ id: 'a1' }],
        };
        const result = getAllComponentDefinitions(data);
        expect(result).toHaveLength(4);
    });

    it('should handle undefined categories', () => {
        const data = { frontends: [{ id: 'f1' }] };
        const result = getAllComponentDefinitions(data);
        expect(result).toHaveLength(1);
    });
});
```

## Implementation

Create helper function:
```typescript
function getAllComponentDefinitions(data: ComponentsData): ComponentData[] {
    return [
        ...(data.frontends ?? []),
        ...(data.backends ?? []),
        ...(data.dependencies ?? []),
        ...(data.integrations ?? []),
        ...(data.appBuilder ?? []),
    ];
}
```

## Expected Outcome

- Helper function extracts aggregation pattern
- Both files use helper (if pattern duplicated)
- All existing tests pass

## Acceptance Criteria

- [ ] Helper function created
- [ ] ConfigureScreen.tsx uses helper
- [ ] ComponentRegistryManager.ts uses helper (if applicable)
- [ ] All existing tests pass
