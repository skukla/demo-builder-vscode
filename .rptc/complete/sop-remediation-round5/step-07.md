# Step 7: Refactor TwoColumnLayout.tsx Inline Styles

## Purpose

Replace static inline styles with utility classes to comply with SOP §11.

## Files to Modify

- `src/core/ui/styles/custom-spectrum.css` - Add `.items-stretch` utility
- `src/core/ui/components/layout/TwoColumnLayout.tsx` - Use utility classes

## Tests to Write First

**No unit tests needed** - visual regression check required.

Pre-flight: Verify TwoColumnLayout renders correctly before changes.

## Implementation

### 1. Add utility class to custom-spectrum.css:

```css
.items-stretch { align-items: stretch !important; }
```

### 2. Refactor container div (lines ~69-77):

Before:
```tsx
style={{
    display: 'flex',
    height: '100%',
    width: '100%',
    flex: '1',
    minHeight: 0,
    gap: translateSpectrumToken(gap),
    alignItems: 'stretch'
}}
```

After:
```tsx
className={cn('flex', 'h-full', 'w-full', 'flex-1', 'min-h-0', 'items-stretch', className)}
style={{ gap: translateSpectrumToken(gap) }}
```

### 3. Refactor left column div:

After:
```tsx
className="flex flex-column w-full min-w-0 overflow-hidden"
style={{
    maxWidth: translateSpectrumToken(leftMaxWidth),
    padding: translateSpectrumToken(leftPadding),
}}
```

### 4. Refactor right column div:

After:
```tsx
className="flex-1 flex flex-column overflow-hidden"
style={{
    padding: translateSpectrumToken(rightPadding),
    backgroundColor: rightBackgroundColor,
    borderLeft: showBorder ? '1px solid var(--spectrum-global-color-gray-300)' : undefined,
}}
```

## Expected Outcome

- `.items-stretch` utility class exists
- Container uses 6 utility classes + 1 inline style (gap)
- Left column uses 5 utility classes + 2 inline styles
- Right column uses 4 utility classes + 3 inline styles
- Visual appearance unchanged

## Acceptance Criteria

- [ ] .items-stretch added to custom-spectrum.css
- [ ] Container div refactored
- [ ] Left column div refactored
- [ ] Right column div refactored
- [ ] Visual appearance unchanged (manual check)
- [ ] All existing tests pass
