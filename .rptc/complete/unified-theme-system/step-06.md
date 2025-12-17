# Step 6: Configure Spectrum Provider

## Purpose
Force dark mode in all Spectrum Providers and remove VS Code theme synchronization logic.

## Prerequisites
- [ ] Steps 1-5 completed (token system, reset, layers, component updates)

## Tests to Write First

- [ ] Test: WebviewApp always uses dark colorScheme
  - **Given:** WebviewApp component
  - **When:** Rendered with any init data
  - **Then:** Provider has colorScheme="dark"
  - **File:** `tests/core/ui/components/WebviewApp.test.tsx`

- [ ] Test: WebviewApp ignores theme-changed messages
  - **Given:** WebviewApp mounted
  - **When:** theme-changed message received
  - **Then:** colorScheme remains "dark"
  - **File:** `tests/core/ui/components/WebviewApp.test.tsx`

- [ ] Test: Sidebar Provider uses dark colorScheme
  - **Given:** SidebarApp component
  - **When:** Rendered
  - **Then:** Provider has colorScheme="dark"
  - **File:** `tests/features/sidebar/ui/SidebarApp.test.tsx`

## Files to Modify

- [ ] `src/core/ui/components/WebviewApp.tsx` - Main Spectrum Provider
- [ ] `src/features/sidebar/ui/index.tsx` - Sidebar Provider

## Implementation Details

### WebviewApp.tsx Changes

**Remove:**
- `theme` state (line 84)
- `ThemeMode` import (line 15)
- `ThemeChangeData` interface (lines 24-26)
- Theme handling in init message handler (lines 102-107)
- `theme-changed` message listener (lines 122-127)
- Dynamic body class updates

**Keep:**
- Static `document.body.classList.add('vscode-dark')` (line 95)
- All other functionality

**Update Provider:**
```tsx
<Provider
    theme={defaultTheme}
    colorScheme="dark"  // Hard-coded, not dynamic
    isQuiet
    UNSAFE_className={className}
>
```

### Sidebar index.tsx Changes

**Remove:**
- Dynamic colorScheme detection (line 126)

**Update both Providers:**
```tsx
<Provider theme={defaultTheme} colorScheme="dark" UNSAFE_className="sidebar-provider">
```

## Expected Outcome
- All Spectrum Providers use `colorScheme="dark"`
- No reaction to theme-changed messages
- Body always has `vscode-dark` class
- Theme state removed from WebviewApp

## Acceptance Criteria
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Spectrum components render in dark mode
- [ ] VS Code theme changes do not affect webviews

## Estimated Time
30 minutes
