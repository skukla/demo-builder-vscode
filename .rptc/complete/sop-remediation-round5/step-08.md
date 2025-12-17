# Step 8: Refactor GridLayout.tsx Inline Styles

## Purpose

Replace static inline styles with utility classes to comply with SOP §11.

## Files to Modify

- `src/core/ui/components/layout/GridLayout.tsx`

## Tests to Write First

**No unit tests needed** - visual regression check required.

## Implementation

Refactor the grid container (lines ~59-66):

Before:
```tsx
style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: translateSpectrumToken(gap),
    maxWidth: translateSpectrumToken(maxWidth),
    padding: translateSpectrumToken(padding),
    width: '100%'
}}
```

After:
```tsx
className={cn('grid', 'w-full', className)}
style={{
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: translateSpectrumToken(gap),
    maxWidth: translateSpectrumToken(maxWidth),
    padding: translateSpectrumToken(padding),
}}
```

## Expected Outcome

- Uses `.grid` and `.w-full` utility classes
- Dynamic properties remain inline (gridTemplateColumns, gap, maxWidth, padding)
- Visual appearance unchanged

## Acceptance Criteria

- [ ] Uses .grid utility class
- [ ] Uses .w-full utility class
- [ ] Dynamic styles remain inline
- [ ] Visual appearance unchanged (manual check)
- [ ] All existing tests pass
