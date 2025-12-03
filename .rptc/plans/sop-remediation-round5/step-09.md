# Step 9: Refactor StatusDot.tsx Inline Styles

## Purpose

Replace static inline styles with utility classes to comply with SOP §11.

## Files to Modify

- `src/core/ui/components/ui/StatusDot.tsx`

## Tests to Write First

**No unit tests needed** - visual regression check required.

## Implementation

Refactor the span element (lines ~51-58):

Before:
```tsx
style={{
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: getColor(),
    flexShrink: 0
}}
```

After:
```tsx
className="inline-block rounded-full shrink-0"
style={{
    width: size,
    height: size,
    backgroundColor: getColor(),
}}
```

## Expected Outcome

- Uses `.inline-block`, `.rounded-full`, `.shrink-0` utility classes
- Dynamic properties remain inline (width, height, backgroundColor)
- Visual appearance unchanged

## Acceptance Criteria

- [ ] Uses .inline-block utility class
- [ ] Uses .rounded-full utility class
- [ ] Uses .shrink-0 utility class
- [ ] Dynamic styles remain inline
- [ ] Visual appearance unchanged (manual check)
- [ ] All existing tests pass
