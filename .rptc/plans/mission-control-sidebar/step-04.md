# Step 4: Polish

## Objective

Add polish to the new architecture: loading states, error handling, keyboard navigation, focus management, and smooth transitions.

## Test Strategy

### Unit Tests

1. **Loading states tests**
   - ProjectsDashboard shows loading spinner while fetching
   - ProjectCard shows loading state during action
   - Sidebar shows loading during context switch

2. **Error states tests**
   - ProjectsDashboard handles fetch error gracefully
   - Shows retry button on error
   - Error message is user-friendly

3. **Keyboard navigation tests**
   - Tab navigates between project cards
   - Enter selects focused card
   - Escape closes modals/dialogs

4. **Focus management tests**
   - Focus moves to first card on load
   - Focus returns after modal closes
   - Focus trapped in dialogs

### Accessibility Tests

1. **Screen reader tests**
   - Project cards have proper ARIA labels
   - Status indicators are announced
   - Navigation is keyboard accessible

## Implementation Tasks

### 4.1 Add Loading States

```typescript
// ProjectsDashboard loading state
const [loading, setLoading] = useState(true);

// Show skeleton or spinner while loading
{loading ? (
    <LoadingSpinner label="Loading projects..." />
) : (
    <ProjectsGrid projects={projects} />
)}
```

**Loading scenarios:**
- Initial projects fetch
- Project card action (start/stop)
- Navigation between screens
- Sidebar context switch

### 4.2 Add Error States

```typescript
// ProjectsDashboard error state
interface ErrorState {
    message: string;
    retry: () => void;
}

// Error display component
<ErrorDisplay
    message="Failed to load projects"
    onRetry={refetchProjects}
/>
```

**Error scenarios:**
- Projects fetch fails
- Project action fails
- Navigation fails
- Communication timeout

### 4.3 Add Keyboard Navigation

```typescript
// Project card keyboard handler
const handleKeyDown = (e: KeyboardEvent, project: Project) => {
    switch (e.key) {
        case 'Enter':
        case ' ':
            onSelect(project);
            break;
        case 'ArrowRight':
            focusNextCard();
            break;
        case 'ArrowLeft':
            focusPreviousCard();
            break;
    }
};
```

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| Tab | Navigate between cards |
| Enter/Space | Select card |
| Arrow keys | Navigate grid |
| Escape | Close modal/cancel |

### 4.4 Add Focus Management

```typescript
// Focus management hook
const useFocusManagement = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Focus first card on mount
    useEffect(() => {
        const firstCard = containerRef.current?.querySelector('[data-card]');
        firstCard?.focus();
    }, []);

    // Return focus after action
    const returnFocus = (cardId: string) => {
        const card = containerRef.current?.querySelector(`[data-card="${cardId}"]`);
        card?.focus();
    };

    return { containerRef, returnFocus };
};
```

**Focus scenarios:**
- Initial load → first card
- After action → return to trigger
- Modal close → return to trigger
- Navigation → appropriate element

### 4.5 Add View Transitions

```css
/* Smooth transitions between views */
.view-transition {
    transition: opacity 150ms ease-in-out;
}

.view-enter {
    opacity: 0;
}

.view-enter-active {
    opacity: 1;
}

.view-exit {
    opacity: 1;
}

.view-exit-active {
    opacity: 0;
}
```

**Transition scenarios:**
- Dashboard → Project Detail
- Dashboard → Wizard
- Sidebar context switch
- Card hover/focus states

### 4.6 Add ARIA Labels and Roles

```typescript
// Project card accessibility
<div
    role="button"
    aria-label={`${project.name}, ${project.status === 'running' ? 'Running' : 'Stopped'}`}
    aria-pressed={isSelected}
    tabIndex={0}
>
    {/* card content */}
</div>

// Status indicator
<span
    role="status"
    aria-label={`Status: ${project.status}`}
>
    {statusIcon}
</span>
```

### 4.7 Add Empty State Animation

```css
/* Subtle animation for empty state CTA */
.empty-state-cta {
    animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
}
```

### 4.8 Add Card Hover States

```css
/* Project card hover effect */
.project-card {
    transition: transform 150ms ease, box-shadow 150ms ease;
}

.project-card:hover,
.project-card:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.project-card:active {
    transform: translateY(0);
}
```

### 4.9 Update Documentation

**Files to create/update:**
- `src/features/projects-dashboard/CLAUDE.md`
- `src/features/sidebar/CLAUDE.md`
- `src/features/project-detail/CLAUDE.md`
- Update main `CLAUDE.md` with new architecture

### 4.10 Final Testing and Verification

- [ ] Manual testing of all flows
- [ ] Accessibility audit (keyboard, screen reader)
- [ ] Performance check (no jank, smooth transitions)
- [ ] Edge cases (empty state, errors, slow network)
- [ ] Cross-platform verification (macOS primary)

## Acceptance Criteria

- [ ] Loading states show during async operations
- [ ] Error states show with retry option
- [ ] Keyboard navigation works throughout
- [ ] Focus management is correct
- [ ] Transitions are smooth (no jank)
- [ ] ARIA labels are appropriate
- [ ] Documentation is updated
- [ ] All tests pass with > 80% coverage
- [ ] No accessibility violations

## Definition of Done (Entire Feature)

- [ ] First-time user sees empty state with CTA
- [ ] Returning user sees project cards
- [ ] Search/filter works when > 5 projects
- [ ] Project card click → Project Detail
- [ ] "+ New" → Wizard (no welcome step)
- [ ] Sidebar shows contextual navigation
- [ ] Back navigation works everywhere
- [ ] Loading/error states handled
- [ ] Keyboard accessible
- [ ] Screen reader friendly
- [ ] Documentation complete
- [ ] All tests pass
- [ ] No regressions in existing features
